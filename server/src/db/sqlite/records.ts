import { cleanRecord, type DayRecord } from '@app/shared';
import type { DepartureRepo, RecordRepo } from '../types';
import { type Ctx, createRows, type RecordRow } from './rows';

export function createRecords(ctx: Ctx): RecordRepo {
  const { get, run, write } = ctx;
  const { hasItem } = createRows(ctx);
  return {
    async patch(itemId, date, patch) {
      return write(() => {
        if (!hasItem(itemId)) return null;
        const old = get<RecordRow>(
          'SELECT * FROM records WHERE item_id = ? AND date = ?',
          itemId,
          date,
        );
        const next: DayRecord | null = cleanRecord({ ...(old && cleanRecord(old)), ...patch });
        if (next) {
          run(
            `INSERT INTO records (item_id, date, c, i, m, mc) VALUES (@item_id, @date, @c, @i, @m, @mc)
             ON CONFLICT (item_id, date) DO UPDATE SET c = @c, i = @i, m = @m, mc = @mc`,
            {
              item_id: itemId,
              date,
              c: next.c ?? null,
              i: next.i ?? null,
              m: next.m ?? null,
              mc: next.mc ?? null,
            },
          );
        } else run('DELETE FROM records WHERE item_id = ? AND date = ?', itemId, date);
        return next ?? {};
      });
    },
  };
}

export function createDepartures({ get, run, write }: Ctx): DepartureRepo {
  return {
    async set(groupId, date, d) {
      return write(() => {
        if (!get('SELECT 1 FROM groups WHERE id = ?', groupId)) return false;
        if (d) {
          run(
            `INSERT INTO departures (group_id, date, d) VALUES (?, ?, ?)
             ON CONFLICT (group_id, date) DO UPDATE SET d = excluded.d`,
            groupId,
            date,
            d,
          );
        } else run('DELETE FROM departures WHERE group_id = ? AND date = ?', groupId, date);
        return true;
      });
    },
  };
}
