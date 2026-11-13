// The Rooms and Cleaning page views: search, level filter, sorts, hide-green and the days since a
// room's general cleaning. Pure, over the data already loaded.
import {
  cleaningLevel,
  cleanThresholds,
  latestCleaning,
  unitStatusOf,
  type Room,
  type RoomColor,
  type RoomStatus,
  type StockData,
} from '@app/shared';

/** `number` = level order; `attention` = the worst unit status first. */
export type RoomSort = 'number' | 'attention';

export interface RoomView {
  /** A level from `roomLevels`, or null = all rooms. */
  level: string | null;
  sort: RoomSort;
  hideGreen: boolean;
}

type ViewData = Pick<
  StockData,
  'rooms' | 'roomUnits' | 'roomStatuses' | 'unitStatus' | 'cleanings' | 'roomTypes'
>;

/** The view plus the typed search (not remembered, so not part of the stored `RoomView`). */
export type RoomQuery = RoomView & { search?: string };

/** A room's level: the first character of its number (101 → "1"). */
export const roomLevel = (number: string): string => number.trim().charAt(0);

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The distinct levels of the rooms, in natural order. */
export const roomLevels = (rooms: readonly Pick<Room, 'number'>[]): string[] =>
  [...new Set(rooms.map((r) => roomLevel(r.number)))].sort(natural.compare);

/** Level by level (natural order), then by number inside the level: 001, 002, 101 … 112, 201. */
export const sortByLevel = <T extends Pick<Room, 'number'>>(rooms: readonly T[]): T[] =>
  [...rooms].sort(
    (a, b) =>
      natural.compare(roomLevel(a.number), roomLevel(b.number)) ||
      natural.compare(a.number, b.number),
  );

const colorUrgency = (color: RoomColor): number =>
  color === 'red' ? 3 : color === 'yellow' ? 2 : color === 'green' ? 0 : 1;

/** A room's worst unit status (the one `roomUrgency` ranks; first one on a tie), none without units. */
export function worstStatus(
  data: Pick<StockData, 'roomUnits' | 'roomStatuses' | 'unitStatus'>,
  roomId: string,
): RoomStatus | undefined {
  let worst: RoomStatus | undefined;
  for (const unit of data.roomUnits) {
    const { status } = unitStatusOf(data, roomId, unit.id);
    if (!worst || colorUrgency(status.color) > colorUrgency(worst.color)) worst = status;
  }
  return worst;
}

/** A room's worst unit status: 3 red, 2 yellow, 1 an extra colour, 0 all green (or no units). */
export function roomUrgency(
  data: Pick<StockData, 'roomUnits' | 'roomStatuses' | 'unitStatus'>,
  roomId: string,
): number {
  const worst = worstStatus(data, roomId);
  return worst ? colorUrgency(worst.color) : 0;
}

/** Every unit's status (unstored = the first status) is green. */
export const allGreen = (
  data: Pick<StockData, 'roomUnits' | 'roomStatuses' | 'unitStatus'>,
  roomId: string,
): boolean =>
  data.roomUnits.every((u) => unitStatusOf(data, roomId, u.id).status.color === 'green');

/**
 * The search, by room number only, case-insensitive and trimmed (empty = every room): the number
 * starts with it (`3` → 301, 315, not 103).
 */
export function matchesSearch(room: Pick<Room, 'number'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || room.number.trim().toLowerCase().startsWith(q);
}

/**
 * The rooms to show, in order. A search looks across every level (the level filter waits until
 * it is cleared); sort and hide-green still apply. Starts from the level-by-level order (`sortByLevel`), so every
 * other sort is stable and ties fall back to it. Hide-green only applies while units exist.
 */
export function viewRooms(data: ViewData, view: RoomQuery): Room[] {
  let rooms = sortByLevel(data.rooms);
  const search = view.search?.trim() ?? '';
  if (search) rooms = rooms.filter((r) => matchesSearch(r, search));
  else if (view.level !== null) rooms = rooms.filter((r) => roomLevel(r.number) === view.level);
  if (view.hideGreen && data.roomUnits.length) rooms = rooms.filter((r) => !allGreen(data, r.id));

  if (view.sort === 'attention') {
    const urgency = new Map(rooms.map((r) => [r.id, roomUrgency(data, r.id)]));
    return rooms.sort((a, b) => urgency.get(b.id)! - urgency.get(a.id)!);
  }
  return rooms;
}

/** The Cleaning page view: a level (null = all) and the dirty-first toggle, plus the typed search. */
export interface CleaningQuery {
  level: string | null;
  dirtyFirst: boolean;
  search?: string;
}

/**
 * The days since a room's latest general cleaning (`0` today, null never) and its colour from the
 * stored thresholds (`cleaningLevel`). `today` is the real local today.
 */
export const cleaningDays = (
  data: Pick<StockData, 'cleanings' | 'settings'>,
  roomId: string,
  today: string,
) => cleaningLevel(latestCleaning(data, roomId)?.date, today, cleanThresholds(data.settings));

/**
 * The Cleaning page's rooms, in order. Level filter and search as in `viewRooms` (a search looks
 * across every level). Dirty first = most days since the latest cleaning first, never cleaned at
 * the very top, ties in level order; off = level order.
 */
export function viewCleaning(
  data: Pick<StockData, 'rooms' | 'roomTypes' | 'cleanings' | 'settings'>,
  view: CleaningQuery,
  today: string,
): Room[] {
  let rooms = sortByLevel(data.rooms);
  const search = view.search?.trim() ?? '';
  if (search) rooms = rooms.filter((r) => matchesSearch(r, search));
  else if (view.level !== null) rooms = rooms.filter((r) => roomLevel(r.number) === view.level);
  if (!view.dirtyFirst) return rooms;

  const days = new Map(
    rooms.map((r) => [r.id, cleaningDays(data, r.id, today).days ?? Number.POSITIVE_INFINITY]),
  );
  return rooms.sort((a, b) => {
    const da = days.get(a.id)!;
    const db = days.get(b.id)!;
    return da === db ? 0 : db > da ? 1 : -1;
  });
}
