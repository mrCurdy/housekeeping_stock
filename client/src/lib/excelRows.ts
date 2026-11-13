// The Excel workbook's rows that are worth testing without ExcelJS (lib/excel.ts writes them).
import { cleaningLevel, cleanThresholds, type StockData } from '@app/shared';
import { sortByLevel } from '@/pages/rooms/roomView';

/** True when the Excel export has something to write: stock items or room cards. */
export const hasExcelData = (d: Pick<StockData, 'items' | 'rooms'>): boolean =>
  d.items.length > 0 || d.rooms.length > 0;

/** One row of the "Cleanings" sheet. A room never cleaned has `last` = the "never" text. */
export interface CleaningRow {
  number: string;
  type: string;
  last: string;
  /** Days since the last general cleaning; empty when never cleaned. */
  days: number | '';
  by: string;
  /** The earlier cleaning dates still kept, newest first, comma-separated. */
  earlier: string;
}

/** The "Cleanings" sheet: one row per room card, level by level. `today` is the real local today. */
export function cleaningSheet(
  data: Pick<StockData, 'rooms' | 'roomTypes' | 'cleanings' | 'settings'>,
  today: string,
  never: string,
): CleaningRow[] {
  const thresholds = cleanThresholds(data.settings);
  const typeName = new Map(data.roomTypes.map((t) => [t.id, t.name]));
  return sortByLevel(data.rooms).map((room) => {
    const [latest, ...earlier] = data.cleanings[room.id] ?? [];
    const type = (room.type && typeName.get(room.type)) || '';
    if (!latest) return { number: room.number, type, last: never, days: '', by: '', earlier: '' };
    return {
      number: room.number,
      type,
      last: latest.date,
      days: cleaningLevel(latest.date, today, thresholds).days ?? '',
      by: latest.by,
      earlier: earlier.map((c) => c.date).join(', '),
    };
  });
}
