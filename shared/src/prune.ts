// Stock pruning: drops old stock data without changing any figure from `keepFrom` on.
import { addDays, formatDate, parseDateLocal } from './dates';
import { createStockMath, type StockState } from './stock';

/**
 * Removes the stock data (records, departures, room counts) dated before `keepFrom`. A count closes
 * the past, so the last dropped day K (the day before `keepFrom`) becomes a carried-over count
 * `records[item][K] = { m: total(K) }` and every later total stays the same. A 0 total isn't carried
 * over, since a replay starts at 0 anyway.
 *
 * Mutates `data`. Returns false (and changes nothing) when nothing is dated before K, so after one
 * run the only rows left before `keepFrom` are the carried-over counts at K.
 */
export function pruneStock(data: StockState, keepFrom: string): boolean {
  const K = formatDate(addDays(parseDateLocal(keepFrom), -1));
  const older = (byDate: Record<string, unknown>) => Object.keys(byDate).some((d) => d < K);
  if (
    !Object.values(data.records).some(older) &&
    !Object.values(data.groupRecords).some(older) &&
    !older(data.counts)
  )
    return false;

  // Every item, not just those with records: departures consume items that have no records.
  const math = createStockMath(data, { minDateStr: K });
  const totals = new Map(data.items.map((item) => [item.id, math.calculateTotal(item.id, K)]));

  const dropUpToK = (byId: Record<string, Record<string, unknown>>) => {
    for (const [id, byDate] of Object.entries(byId)) {
      for (const d of Object.keys(byDate)) if (d <= K) delete byDate[d];
      if (Object.keys(byDate).length === 0) delete byId[id];
    }
  };
  dropUpToK(data.records);
  dropUpToK(data.groupRecords);
  for (const d of Object.keys(data.counts)) if (d <= K) delete data.counts[d];

  for (const [id, total] of totals) if (total !== 0) (data.records[id] ??= {})[K] = { m: total };
  return true;
}
