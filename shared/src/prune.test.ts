import { describe, expect, it } from 'vitest';
import { addDays, dateRange, formatDate, parseDateLocal } from './dates';
import { pruneStock } from './prune';
import { createStockMath, type StockState } from './stock';
import { CHECKLIST_DAYS, HISTORY_DAYS } from './types';

const TODAY = '2026-11-13';
const shift = (d: string, n: number) => formatDate(addDays(parseDateLocal(d), n));
const KEEP_FROM = shift(TODAY, -HISTORY_DAYS - 2);
const K = shift(KEEP_FROM, -1);

/** A small deterministic PRNG, so the generated dataset is the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

/** 90 days of mixed data: income, extra/manual consumption, counts, departures, room counts (also in a removed room). */
function generate(): StockState {
  const rand = rng(42);
  const pick = (n: number) => Math.floor(rand() * n);
  const state: StockState = {
    items: [
      { id: 'towel', name: 'Towel', multipliers: { g1: 2, g2: 1 } },
      { id: 'soap', name: 'Soap', multipliers: { g1: 1 } },
      { id: 'sheet', name: 'Sheet', multipliers: { g2: 3 } },
      { id: 'plain', name: 'Plain', multipliers: {} },
    ],
    groups: [
      { id: 'g1', name: 'DOUBLE' },
      { id: 'g2', name: 'TRIPLE' },
    ],
    records: {},
    groupRecords: {},
    counts: {},
  };
  for (const d of dateRange(shift(TODAY, -89), TODAY)) {
    for (const g of ['g1', 'g2']) {
      if (rand() < 0.7) (state.groupRecords[g] ??= {})[d] = { d: 1 + pick(5) };
    }
    for (const item of ['towel', 'soap', 'sheet']) {
      const r = rand();
      const rec =
        r < 0.15
          ? { i: 10 + pick(40) }
          : r < 0.22
            ? { m: pick(80) }
            : r < 0.27
              ? { mc: pick(6) }
              : r < 0.32
                ? { c: pick(3), i: pick(10) }
                : null;
      if (rec) (state.records[item] ??= {})[d] = rec;
    }
    if (rand() < 0.1) {
      const loc = rand() < 0.5 ? 'gone' : 'l1';
      state.counts[d] = { [loc]: { towel: pick(30), soap: pick(20) } };
    }
  }
  return state;
}

const clone = (s: StockState): StockState => structuredClone(s);
const math = (s: StockState) => createStockMath(s, { minDateStr: KEEP_FROM });

/** Every item's figures for every day from keepFrom to today. */
function figures(s: StockState) {
  const m = math(s);
  return s.items.map((item) =>
    dateRange(KEEP_FROM, TODAY).map((d) => ({
      total: m.calculateTotal(item.id, d),
      day: m.dayFigures(item, d, m.calculateTotal(item.id, shift(d, -1))),
      series: m.series(item, TODAY).get(d),
    })),
  );
}

/** The stored rows dated on or after `from`. */
function rowsFrom(s: StockState, from: string) {
  const keep = <T>(byDate: Record<string, T>) =>
    Object.fromEntries(Object.entries(byDate).filter(([d]) => d >= from));
  const each = <T>(byId: Record<string, Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(byId)
        .map(([id, r]) => [id, keep(r)] as const)
        .filter(([, r]) => Object.keys(r).length > 0),
    );
  return { records: each(s.records), groupRecords: each(s.groupRecords), counts: keep(s.counts) };
}

describe('pruneStock', () => {
  it('HISTORY_DAYS is the one window, and CHECKLIST_DAYS follows it', () => {
    expect(HISTORY_DAYS).toBe(30);
    expect(CHECKLIST_DAYS).toBe(HISTORY_DAYS);
  });

  it('(a) keeps every figure from keepFrom to today', () => {
    const before = generate();
    const after = clone(before);
    expect(pruneStock(after, KEEP_FROM)).toBe(true);
    expect(figures(after)).toEqual(figures(before));

    // Nothing is left on or before K except the carried-over counts at K.
    for (const byDate of Object.values(after.groupRecords))
      expect(Object.keys(byDate).every((d) => d > K)).toBe(true);
    expect(Object.keys(after.counts).every((d) => d > K)).toBe(true);
    for (const [id, byDate] of Object.entries(after.records)) {
      for (const [d, rec] of Object.entries(byDate)) {
        if (d > K) continue;
        expect(d).toBe(K);
        expect(rec).toEqual({ m: math(before).calculateTotal(id, K) });
      }
    }
  });

  it('(b) a second run finds nothing to do', () => {
    const data = generate();
    expect(pruneStock(data, KEEP_FROM)).toBe(true);
    const once = clone(data);
    expect(pruneStock(data, KEEP_FROM)).toBe(false);
    expect(data).toEqual(once);
  });

  it("(c) a removed room's counts before K are gone and the totals still match", () => {
    const before: StockState = {
      items: [{ id: 'towel', name: 'Towel', multipliers: {} }],
      groups: [],
      records: { towel: { [shift(KEEP_FROM, 3)]: { i: 5 } } },
      groupRecords: {},
      counts: { [shift(K, -10)]: { gone: { towel: 12 } } },
    };
    const after = clone(before);
    expect(pruneStock(after, KEEP_FROM)).toBe(true);
    expect(after.counts).toEqual({});
    expect(after.records.towel![K]).toEqual({ m: 12 });
    expect(figures(after)).toEqual(figures(before));
    expect(math(after).calculateTotal('towel', TODAY)).toBe(17);
  });

  it('(d) an item with no history is untouched', () => {
    const data = generate();
    pruneStock(data, KEEP_FROM);
    expect(data.records.plain).toBeUndefined();

    // A zero total isn't carried over: a replay starts at 0 anyway.
    const zero: StockState = {
      items: [{ id: 'towel', name: 'Towel', multipliers: {} }],
      groups: [],
      records: { towel: { [shift(K, -5)]: { m: 0 } } },
      groupRecords: {},
      counts: {},
    };
    expect(pruneStock(zero, KEEP_FROM)).toBe(true);
    expect(zero.records).toEqual({});
  });

  it('(e) a day from keepFrom on is never touched', () => {
    const before = generate();
    const after = clone(before);
    pruneStock(after, KEEP_FROM);
    expect(rowsFrom(after, KEEP_FROM)).toEqual(rowsFrom(before, KEEP_FROM));
  });

  it('returns false when nothing is older than K', () => {
    const data: StockState = {
      items: [{ id: 'towel', name: 'Towel', multipliers: {} }],
      groups: [],
      records: { towel: { [KEEP_FROM]: { i: 5 } } },
      groupRecords: {},
      counts: {},
    };
    const copy = clone(data);
    expect(pruneStock(data, KEEP_FROM)).toBe(false);
    expect(data).toEqual(copy);
  });
});
