import { randomUUID } from 'node:crypto';
import {
  createdName,
  emptyStockData,
  removeStatusIn,
  renameIn,
  type Room,
  type RoomStatus,
  type RoomType,
  type RoomUnit,
  type RoomUnitGroup,
  type UnitStatus,
  DEFAULT_UNIT_GROUP_ID,
  removeUnitGroupIn,
} from '@app/shared';
import type {
  OrderedRepo,
  RoomRepo,
  RoomStatusRepo,
  RoomUnitGroupRepo,
  RoomUnitRepo,
} from '../types';
import { type Ctx, createRows, namedRepo, namesJson, type NamedTable } from './rows';

/** Room cards: number, type, note, the units' current statuses and the general cleanings. */
export function createRooms(ctx: Ctx): RoomRepo {
  const { get, run, write } = ctx;
  const { readRoom, hasRow, readRoomStatuses, readCleanings } = createRows(ctx);
  const numberTaken = (number: string, except = '') =>
    !!get('SELECT 1 FROM rooms WHERE number = ? AND id != ?', number, except);
  /** '' = no type; an unknown id = invalid. */
  const typeOk = (type: string | undefined) => !type || hasRow('room_types', type);

  return {
    async create({ number, type, note }) {
      note = note?.trim();
      return write(() => {
        if (!typeOk(type)) return null;
        if (numberTaken(number)) return 'duplicate' as const;
        const room: Room = {
          id: randomUUID(),
          number,
          ...(type && { type }),
          ...(note && { note }),
        };
        run(
          'INSERT INTO rooms (id, number, type_id, note) VALUES (?, ?, ?, ?)',
          room.id,
          number,
          room.type ?? null,
          room.note ?? null,
        );
        return room;
      });
    },
    async update(id, { number, type, note }) {
      return write(() => {
        if (!hasRow('rooms', id) || !typeOk(type)) return null;
        if (number !== undefined) {
          if (numberTaken(number, id)) return 'duplicate' as const;
          run('UPDATE rooms SET number = ? WHERE id = ?', number, id);
        }
        if (type !== undefined) run('UPDATE rooms SET type_id = ? WHERE id = ?', type || null, id);
        if (note !== undefined)
          run('UPDATE rooms SET note = ? WHERE id = ?', note.trim() || null, id);
        return readRoom(id)!;
      });
    },
    async delete(id) {
      return write(() => {
        if (!run('DELETE FROM rooms WHERE id = ?', id).changes) return false;
        run('DELETE FROM unit_status WHERE room_id = ?', id);
        run('DELETE FROM cleanings WHERE room_id = ?', id);
        return true;
      });
    },
    async setUnitStatus(roomId, unitId, { status, by, note }) {
      return write(() => {
        if (!hasRow('rooms', roomId) || !hasRow('room_units', unitId)) return null;
        if (!readRoomStatuses().some((s) => s.id === status)) return null;
        const entry: UnitStatus = {
          status,
          by,
          at: new Date().toISOString(),
          ...(note && { note }),
        };
        run(
          `INSERT INTO unit_status (room_id, unit_id, status_id, by, at, note) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (room_id, unit_id) DO UPDATE SET status_id = excluded.status_id,
           by = excluded.by, at = excluded.at, note = excluded.note`,
          roomId,
          unitId,
          status,
          by,
          entry.at,
          entry.note ?? null,
        );
        return entry;
      });
    },
    async addCleaning(roomId, { date, by }) {
      return write(() => {
        if (!hasRow('rooms', roomId)) return null;
        run(
          'INSERT INTO cleanings (room_id, date, by, at) VALUES (?, ?, ?, ?)',
          roomId,
          date,
          by,
          new Date().toISOString(),
        );
        return readCleanings(roomId);
      });
    },
  };
}

/** A master list with create / rename / delete (+ `onDelete`) / reorder. */
const orderedRepo = <T extends RoomType | RoomUnit | RoomUnitGroup>(
  ctx: Ctx,
  table: NamedTable,
  onDelete: (id: string) => void,
): OrderedRepo<T> => {
  const { readNamed, reorderRows } = createRows(ctx);
  return {
    ...namedRepo<T>(ctx, table, onDelete),
    async reorder(ids) {
      return ctx.write(() => reorderRows(table, readNamed(table), ids) as T[]);
    },
  };
};

/**
 * The master layout every room shares; removing a unit drops its statuses on every card. Each
 * unit is in a group (`room_units.group_id`); `pos` orders all units, so also within a group.
 */
export function createRoomUnits(ctx: Ctx): RoomUnitRepo {
  const { get, run, prepare, write } = ctx;
  const { nextPos, readUnits, hasRow, readNamed } = createRows(ctx);
  /** The group a new unit goes to: `group` if it exists, else the first one, else a new default. */
  const groupFor = (group: string | undefined) => {
    if (group && hasRow('room_unit_groups', group)) return group;
    const first = readNamed('room_unit_groups')[0];
    if (first) return first.id;
    run(
      'INSERT INTO room_unit_groups (id, name, pos) VALUES (?, ?, ?)',
      DEFAULT_UNIT_GROUP_ID,
      '',
      nextPos('room_unit_groups'),
    );
    return DEFAULT_UNIT_GROUP_ID;
  };
  const named = namedRepo<RoomUnit>(ctx, 'room_units', (id) =>
    run('DELETE FROM unit_status WHERE unit_id = ?', id),
  );
  return {
    ...named,
    async create(name, group, lang) {
      return write(() => {
        const unit: RoomUnit = {
          id: randomUUID(),
          ...createdName(name, lang),
          group: groupFor(group),
        };
        run(
          'INSERT INTO room_units (id, name, names, group_id, pos) VALUES (?, ?, ?, ?, ?)',
          unit.id,
          name,
          namesJson(unit.names),
          unit.group,
          nextPos('room_units'),
        );
        return unit;
      });
    },
    async rename(id, name, lang) {
      const done = await named.rename(id, name, lang);
      const row =
        done &&
        get<{ group_id: string | null }>('SELECT group_id FROM room_units WHERE id = ?', id);
      return done && { ...done, ...(row?.group_id && { group: row.group_id }) };
    },
    async reorder(ids, move) {
      return write(() => {
        const rank = new Map(ids.map((id, n) => [id, n]));
        const at = (id: string) => rank.get(id) ?? Infinity;
        const units = readUnits().sort((a, b) => at(a.id) - at(b.id)); // stable: unlisted keep order
        const unit = move && units.find((u) => u.id === move.id);
        if (unit && hasRow('room_unit_groups', move.group)) {
          unit.group = move.group;
          run('UPDATE room_units SET group_id = ? WHERE id = ?', move.group, unit.id);
        }
        const stmt = prepare('UPDATE room_units SET pos = ? WHERE id = ?');
        units.forEach((u, pos) => stmt.run(pos, u.id));
        return units;
      });
    },
  };
}

/** The groups the units are listed in. One that still has units isn't deleted ('notEmpty'). */
export function createRoomUnitGroups(ctx: Ctx): RoomUnitGroupRepo {
  const ordered = orderedRepo<RoomUnitGroup>(ctx, 'room_unit_groups', () => {});
  const { readUnits, readNamed } = createRows(ctx);
  return {
    ...ordered,
    async delete(id) {
      const data = { roomUnits: readUnits(), roomUnitGroups: readNamed('room_unit_groups') };
      const done = removeUnitGroupIn(data, id);
      return done === true ? ordered.delete(id) : done;
    },
  };
}

/** Removing a type clears it on its cards. */
export const createRoomTypes = (ctx: Ctx) =>
  orderedRepo<RoomType>(ctx, 'room_types', (id) =>
    ctx.run('UPDATE rooms SET type_id = NULL WHERE type_id = ?', id),
  );

/** Unit statuses. Any change stores the whole list, so the defaults get stored on the first one. */
export function createRoomStatuses(ctx: Ctx): RoomStatusRepo {
  const { run, write } = ctx;
  const { readRoomStatuses, writeRoomStatuses } = createRows(ctx);
  return {
    async create({ name, color, lang }) {
      return write(() => {
        const status: RoomStatus = { id: randomUUID(), ...createdName(name, lang), color };
        writeRoomStatuses([...readRoomStatuses(), status]);
        return status;
      });
    },
    async update(id, patch) {
      return write(() => {
        const list = readRoomStatuses();
        const status = list.find((s) => s.id === id);
        if (!status) return null;
        const at = list.indexOf(status);
        if (patch.name !== undefined) list[at] = renameIn(status, patch.name, patch.lang);
        if (patch.color !== undefined) list[at]!.color = patch.color;
        writeRoomStatuses(list);
        return list[at]!;
      });
    },
    async delete(id) {
      return write(() => {
        const data = { ...emptyStockData(), roomStatuses: readRoomStatuses() };
        if (!data.roomStatuses.some((s) => s.id === id)) return false;
        if (!removeStatusIn(data, id)) return 'last' as const;
        writeRoomStatuses(data.roomStatuses);
        // removeStatusIn's rule: the units go back to the first status (= no stored entry)
        run('DELETE FROM unit_status WHERE status_id = ?', id);
        return true;
      });
    },
    async reorder(ids) {
      return write(() => {
        const rank = new Map(ids.map((id, n) => [id, n]));
        const at = (id: string) => rank.get(id) ?? Infinity;
        const list = readRoomStatuses().sort((a, b) => at(a.id) - at(b.id));
        writeRoomStatuses(list);
        return list;
      });
    },
  };
}
