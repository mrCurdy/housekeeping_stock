// Stock rules: pure functions over the dataset, used by the pages and the Excel export.
import { dateRange, formatDate, parseDateLocal } from './dates';
import type { Item, StockData } from './types';

export type StockState = Pick<
  StockData,
  'items' | 'records' | 'groups' | 'groupRecords' | 'counts'
>;

export interface DayFigures {
  consumption: number;
  income: number;
  /** End-of-day stock */
  total: number;
  /** The total is a count (typed on the Stock page or summed from the rooms), not a calculation */
  counted: boolean;
}

export function createStockMath(state: StockState, { minDateStr }: { minDateStr: string }) {
  /** Sum of the room counts for an item on a day (including rooms removed since), or null when nobody counted it */
  const roomSum = (itemId: string, dateStr: string): number | null => {
    const byLocation = state.counts[dateStr];
    if (!byLocation) return null;
    let sum = 0;
    let found = false;
    for (const room of Object.values(byLocation)) {
      const v = room[itemId];
      if (v != null) {
        sum += v;
        found = true;
      }
    }
    return found ? sum : null;
  };

  /** Departures × items used per departure, over all groups */
  const autoConsumption = (item: Item, dateStr: string): number => {
    let total = 0;
    for (const g of state.groups) {
      const qty = item.multipliers[g.id] ?? 0;
      if (qty > 0) total += qty * (state.groupRecords[g.id]?.[dateStr]?.d ?? 0);
    }
    return total;
  };

  /**
   * One day of an item, given the previous day's stock.
   * A count is the end-of-day figure, so that day's income/consumption don't change it.
   * Precedence: count typed on the Stock page (m) > sum of the room counts > calculation.
   */
  const dayFigures = (item: Item, dateStr: string, prevTotal: number): DayFigures => {
    const rec = state.records[item.id]?.[dateStr];
    const auto = autoConsumption(item, dateStr);
    const consumption = rec?.mc != null ? rec.mc : auto + (rec?.c ?? 0);
    const income = rec?.i ?? 0;
    const rooms = rec?.m != null ? null : roomSum(item.id, dateStr);
    const counted = rec?.m != null || rooms != null;
    const total = rec?.m != null ? rec.m : rooms != null ? rooms : prevTotal + income - consumption;
    return { consumption, income, total, counted };
  };

  /** Earliest date anything was recorded (never later than minDateStr) */
  const earliestDate = (): string => {
    let earliest = minDateStr;
    const see = (d: string) => {
      if (d < earliest) earliest = d;
    };
    Object.values(state.records).forEach((byDate) => Object.keys(byDate).forEach(see));
    Object.values(state.groupRecords).forEach((byDate) => Object.keys(byDate).forEach(see));
    Object.keys(state.counts).forEach(see);
    return earliest;
  };

  /**
   * Day-by-day figures for an item from the earliest record up to `toDateStr`.
   * Totals aren't stored: they are always replayed from the start.
   */
  const series = (item: Item, toDateStr: string): Map<string, DayFigures> => {
    const out = new Map<string, DayFigures>();
    let total = 0;
    const from = earliestDate();
    if (from > toDateStr) return out;
    for (const d of dateRange(from, toDateStr)) {
      const f = dayFigures(item, d, total);
      total = f.total;
      out.set(d, f);
    }
    return out;
  };

  const calculateTotal = (itemId: string, targetDateStr: string): number => {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return 0;
    let total = 0;
    const curr = parseDateLocal(earliestDate());
    const target = parseDateLocal(targetDateStr);
    while (curr <= target) {
      total = dayFigures(item, formatDate(curr), total).total;
      curr.setDate(curr.getDate() + 1);
    }
    return total;
  };

  /** Whether anything happened to an item on a day: consumption, income or a count. */
  const hasActivity = (itemId: string, dateStr: string): boolean => {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return false;
    const f = dayFigures(item, dateStr, 0);
    return f.counted || f.consumption !== 0 || f.income !== 0;
  };

  return {
    roomSum,
    autoConsumption,
    dayFigures,
    series,
    calculateTotal,
    hasActivity,
    earliestDate,
  };
}

export type StockMath = ReturnType<typeof createStockMath>;
