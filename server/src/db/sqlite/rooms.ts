import { randomUUID } from 'node:crypto';
import {
  emptyStockData,
  removeStatusIn,
  type Room,
  type RoomStatus,
  type RoomType,
  type RoomUnit,
  type UnitStatus,
} from '@app/shared';
import type { OrderedRepo, RoomRepo, RoomStatusRepo } from '../types';
import { type Ctx, createRows, namedRepo, type NamedTable } from './rows';

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
const orderedRepo = <T extends RoomType | RoomUnit>(
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

/** The master layout every room shares; removing a unit drops its statuses on every card. */
export const createRoomUnits = (ctx: Ctx) =>
  orderedRepo<RoomUnit>(ctx, 'room_units', (id) =>
    ctx.run('DELETE FROM unit_status WHERE unit_id = ?', id),
  );

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
    async create({ name, color }) {
      return write(() => {
        const status: RoomStatus = { id: randomUUID(), name, color };
        writeRoomStatuses([...readRoomStatuses(), status]);
        return status;
      });
    },
    async update(id, patch) {
      return write(() => {
        const list = readRoomStatuses();
        const status = list.find((s) => s.id === id);
        if (!status) return null;
        if (patch.name !== undefined) status.name = patch.name;
        if (patch.color !== undefined) status.color = patch.color;
        writeRoomStatuses(list);
        return status;
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
