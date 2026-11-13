import type { DayCounts } from '@app/shared';
import type { CountRepo } from '../types';
import { type CountRow, type Ctx, createRows } from './rows';

export function createCounts(ctx: Ctx): CountRepo {
  const { all, get, run, write } = ctx;
  const { hasItem } = createRows(ctx);
  return {
    async set(date, locationId, itemId, value) {
      return write(() => {
        if (!hasItem(itemId)) return null;
        if (!get('SELECT 1 FROM locations WHERE id = ?', locationId)) return null;
        if (value === null) {
          run(
            'DELETE FROM counts WHERE date = ? AND location_id = ? AND item_id = ?',
            date,
            locationId,
            itemId,
          );
        } else {
          run(
            `INSERT INTO counts (date, location_id, item_id, value) VALUES (?, ?, ?, ?)
             ON CONFLICT (date, location_id, item_id) DO UPDATE SET value = excluded.value`,
            date,
            locationId,
            itemId,
            value,
          );
        }
        const day: DayCounts = {};
        for (const r of all<CountRow>('SELECT * FROM counts WHERE date = ? ORDER BY rowid', date)) {
          (day[r.location_id] ??= {})[r.item_id] = r.value;
        }
        return day;
      });
    },
  };
}
