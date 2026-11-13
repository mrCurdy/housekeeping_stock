// The Rooms page view: level filter, sort and hide-green. Pure, over the data already loaded.
import {
  latestCleaning,
  sortRooms,
  unitStatusOf,
  type Room,
  type RoomColor,
  type StockData,
} from '@app/shared';

export type RoomSort = 'number' | 'cleanedNew' | 'cleanedOld' | 'attention';

export interface RoomView {
  /** A level from `roomLevels`, or null = all rooms. */
  level: string | null;
  sort: RoomSort;
  hideGreen: boolean;
}

type ViewData = Pick<
  StockData,
  'rooms' | 'roomUnits' | 'roomStatuses' | 'unitStatus' | 'cleanings'
>;

/** A room's level: the first character of its number (101 → "1"). */
export const roomLevel = (number: string): string => number.trim().charAt(0);

/** The distinct levels of the rooms, in natural order. */
export const roomLevels = (rooms: readonly Pick<Room, 'number'>[]): string[] =>
  sortRooms([...new Set(rooms.map((r) => roomLevel(r.number)))].map((number) => ({ number }))).map(
    (r) => r.number,
  );

const colorUrgency = (color: RoomColor): number =>
  color === 'red' ? 3 : color === 'yellow' ? 2 : color === 'green' ? 0 : 1;

/** A room's worst unit status: 3 red, 2 yellow, 1 an extra colour, 0 all green (or no units). */
export function roomUrgency(
  data: Pick<StockData, 'roomUnits' | 'roomStatuses' | 'unitStatus'>,
  roomId: string,
): number {
  let worst = 0;
  for (const unit of data.roomUnits)
    worst = Math.max(worst, colorUrgency(unitStatusOf(data, roomId, unit.id).status.color));
  return worst;
}

/** Every unit's status (unstored = the first status) is green. */
export const allGreen = (
  data: Pick<StockData, 'roomUnits' | 'roomStatuses' | 'unitStatus'>,
  roomId: string,
): boolean =>
  data.roomUnits.every((u) => unitStatusOf(data, roomId, u.id).status.color === 'green');

/**
 * The rooms to show, in order. Starts from number order (`sortRooms`), so every other sort is
 * stable and ties fall back to the number. Hide-green only applies while units exist.
 */
export function viewRooms(data: ViewData, view: RoomView): Room[] {
  let rooms = sortRooms(data.rooms);
  if (view.level !== null) rooms = rooms.filter((r) => roomLevel(r.number) === view.level);
  if (view.hideGreen && data.roomUnits.length) rooms = rooms.filter((r) => !allGreen(data, r.id));

  if (view.sort === 'attention') {
    const urgency = new Map(rooms.map((r) => [r.id, roomUrgency(data, r.id)]));
    return rooms.sort((a, b) => urgency.get(b.id)! - urgency.get(a.id)!);
  }
  if (view.sort === 'cleanedNew' || view.sort === 'cleanedOld') {
    const newest = view.sort === 'cleanedNew';
    const last = new Map(rooms.map((r) => [r.id, latestCleaning(data, r.id)?.date ?? '']));
    // Never cleaned = '' : last when newest first, first when oldest first.
    return rooms.sort((a, b) => {
      const da = last.get(a.id)!;
      const db = last.get(b.id)!;
      if (da === db) return 0;
      return (da < db ? -1 : 1) * (newest ? -1 : 1);
    });
  }
  return rooms;
}
