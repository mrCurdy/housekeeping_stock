import type { StockData } from '@app/shared';

/** True when the dataset has anything worth a backup: stock, checklist or room setup. */
export function hasData(d: StockData): boolean {
  return [
    d.items,
    d.groups,
    d.locations,
    d.tasks,
    d.rooms,
    d.roomTypes,
    d.roomUnits,
    d.roomStatuses,
  ].some((list) => list.length > 0);
}

/** What Restore's confirmation tells about a backup file. */
export interface BackupCounts {
  items: number;
  groups: number;
  locations: number;
  /** Room cards. */
  rooms: number;
  /** Rooms with at least one general cleaning. */
  cleaned: number;
}

export function backupCounts(d: StockData): BackupCounts {
  return {
    items: d.items.length,
    groups: d.groups.length,
    locations: d.locations.length,
    rooms: d.rooms.length,
    cleaned: Object.values(d.cleanings).filter((list) => list.length > 0).length,
  };
}
