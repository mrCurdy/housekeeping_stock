// Room cards: the pure rules shared by the server and the client's optimistic updates.
import { parseDateLocal } from './dates';
import {
  DEFAULT_CLEAN_DAYS,
  DEFAULT_ROOM_STATUSES,
  type AppSettings,
  type Cleaning,
  type CleanThresholds,
  type Room,
  type RoomColor,
  type RoomStatus,
  type StockData,
  type UnitStatus,
} from './types';

type RoomData = Pick<
  StockData,
  'rooms' | 'roomTypes' | 'roomUnits' | 'roomStatuses' | 'unitStatus' | 'cleanings'
>;

/** The statuses in order: the stored ones, or the defaults while none is stored. Never empty. */
export const roomStatusList = (data: Pick<StockData, 'roomStatuses'>): RoomStatus[] =>
  (data.roomStatuses.length ? data.roomStatuses : DEFAULT_ROOM_STATUSES).map((s) => ({ ...s }));

/**
 * A unit's status on a card: the stored one (`entry`, with who/when/note), or the first status when
 * nothing (or a status that no longer exists) is stored.
 */
export function unitStatusOf(
  data: Pick<StockData, 'roomStatuses' | 'unitStatus'>,
  roomId: string,
  unitId: string,
): { status: RoomStatus; entry?: UnitStatus } {
  const list = roomStatusList(data);
  const entry = data.unitStatus[roomId]?.[unitId];
  const status = entry && list.find((s) => s.id === entry.status);
  return status ? { status, entry } : { status: list[0]! };
}

/** The cleaning thresholds from the settings; an invalid pair falls back to the defaults. */
export function cleanThresholds(settings: AppSettings): CleanThresholds {
  const green = settings.cleanGreenDays ?? DEFAULT_CLEAN_DAYS.green;
  const yellow = settings.cleanYellowDays ?? DEFAULT_CLEAN_DAYS.yellow;
  return green >= 0 && green < yellow ? { green, yellow } : { ...DEFAULT_CLEAN_DAYS };
}

/** Whole calendar days from `from` to `to` (local dates; DST-safe). */
const daysBetween = (from: string, to: string): number =>
  Math.round((parseDateLocal(to).getTime() - parseDateLocal(from).getTime()) / 86_400_000);

/**
 * How long ago a room's last general cleaning was, and its colour. `today` is the real local today,
 * not the date switcher's day. Never cleaned = `days: null`, red.
 */
export function cleaningLevel(
  lastDate: string | undefined,
  today: string,
  thresholds: CleanThresholds,
): { days: number | null; color: Extract<RoomColor, 'green' | 'yellow' | 'red'> } {
  if (!lastDate) return { days: null, color: 'red' };
  const days = daysBetween(lastDate, today);
  const color = days <= thresholds.green ? 'green' : days <= thresholds.yellow ? 'yellow' : 'red';
  return { days, color };
}

/** A room's latest general cleaning (the list is newest first). */
export const latestCleaning = (
  data: Pick<StockData, 'cleanings'>,
  roomId: string,
): Cleaning | undefined => data.cleanings[roomId]?.[0];

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The rooms sorted by number in natural order (2 < 10 < 101). Returns a new array. */
export const sortRooms = <T extends Pick<Room, 'number'>>(rooms: readonly T[]): T[] =>
  [...rooms].sort((a, b) => natural.compare(a.number, b.number));

/** Drops the matching entries from every room's map, and rooms left with none. */
function dropUnitStatuses(data: RoomData, drop: (unitId: string, s: UnitStatus) => boolean) {
  for (const [roomId, byUnit] of Object.entries(data.unitStatus)) {
    for (const [unitId, s] of Object.entries(byUnit)) if (drop(unitId, s)) delete byUnit[unitId];
    if (!Object.keys(byUnit).length) delete data.unitStatus[roomId];
  }
}

/** Removes a unit from the master layout, and its status on every card. */
export function removeUnitIn(data: RoomData, unitId: string): void {
  data.roomUnits = data.roomUnits.filter((u) => u.id !== unitId);
  dropUnitStatuses(data, (id) => id === unitId);
}

/**
 * Removes a status; its units go back to the first status (their entries are dropped). On the
 * defaults the remaining ones get stored. The last status can't be removed: returns false (also for
 * an unknown id) and changes nothing.
 */
export function removeStatusIn(data: RoomData, statusId: string): boolean {
  const list = roomStatusList(data);
  if (list.length <= 1 || !list.some((s) => s.id === statusId)) return false;
  data.roomStatuses = list.filter((s) => s.id !== statusId);
  dropUnitStatuses(data, (_, s) => s.status === statusId);
  return true;
}

/** Removes a room type and clears it on its cards. */
export function removeTypeIn(data: RoomData, typeId: string): void {
  data.roomTypes = data.roomTypes.filter((t) => t.id !== typeId);
  data.rooms = data.rooms.map(({ type, ...room }) =>
    type && type !== typeId ? { ...room, type } : room,
  );
}

/** Removes a room card with its unit statuses and cleanings. */
export function removeRoomIn(data: RoomData, roomId: string): void {
  data.rooms = data.rooms.filter((r) => r.id !== roomId);
  delete data.unitStatus[roomId];
  delete data.cleanings[roomId];
}

/**
 * Deletes cleanings dated before `keepFrom`, except each room's latest (so "45 days ago" still
 * shows). Mutates `cleanings`; returns true if anything was removed.
 */
export function pruneCleanings(cleanings: Record<string, Cleaning[]>, keepFrom: string): boolean {
  let changed = false;
  for (const [roomId, list] of Object.entries(cleanings)) {
    const kept = list.filter((c, i) => i === 0 || c.date >= keepFrom);
    if (kept.length !== list.length) {
      cleanings[roomId] = kept;
      changed = true;
    }
  }
  return changed;
}
