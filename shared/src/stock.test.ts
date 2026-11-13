import { describe, expect, it } from 'vitest';
import { backupSchema } from './schemas';
import { dateRange } from './dates';
import { createStockMath, type StockState } from './stock';
import type { Item } from './types';

const make = (overrides: Partial<StockState> = {}) =>
  createStockMath(
    {
      items: [{ id: 'towel', name: 'Towel', multipliers: { g1: 2 } }],
      records: {},
      groups: [{ id: 'g1', name: 'DOUBLE' }],
      groupRecords: {},
      counts: {},
      ...overrides,
    },
    { minDateStr: '2026-10-01' },
  );

describe('stock rules', () => {
  it('income adds and departures × multiplier consume', () => {
    const math = make({
      records: { towel: { '2026-10-01': { i: 20 } } },
      groupRecords: { g1: { '2026-10-02': { d: 3 } } },
    });
    expect(math.calculateTotal('towel', '2026-10-01')).toBe(20);
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(14);
  });

  it('manual consumption replaces auto consumption; extra adds to it', () => {
    const math = make({
      records: {
        towel: { '2026-10-01': { i: 20 }, '2026-10-02': { mc: 1 }, '2026-10-03': { c: 1 } },
      },
      groupRecords: { g1: { '2026-10-02': { d: 3 }, '2026-10-03': { d: 1 } } },
    });
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(19);
    expect(math.calculateTotal('towel', '2026-10-03')).toBe(16);
  });

  it("a count is the end-of-day figure: that day's income is ignored", () => {
    const math = make({ records: { towel: { '2026-10-01': { i: 20, m: 7 } } } });
    expect(math.calculateTotal('towel', '2026-10-01')).toBe(7);
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(7);
  });

  it('room counts are summed and override the calculation', () => {
    const math = make({
      records: { towel: { '2026-10-01': { i: 100 } } },
      counts: { '2026-10-02': { l1: { towel: 10 }, l2: { towel: 5 } } },
    });
    expect(math.roomSum('towel', '2026-10-02')).toBe(15);
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(15);
  });

  it('a count typed on the Stock page wins over room counts', () => {
    const math = make({
      records: { towel: { '2026-10-02': { m: 40 } } },
      counts: { '2026-10-02': { l1: { towel: 10 } } },
    });
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(40);
  });

  it('0 is a real count, not "not counted"', () => {
    const math = make({
      records: { towel: { '2026-10-01': { i: 9 } } },
      counts: { '2026-10-02': { l1: { towel: 0 } } },
    });
    expect(math.roomSum('towel', '2026-10-02')).toBe(0);
    expect(math.calculateTotal('towel', '2026-10-02')).toBe(0);
  });

  it('hasActivity: only days with consumption, income or a count', () => {
    const math = make({
      records: { towel: { '2026-10-01': { i: 20 } } },
      groupRecords: { g1: { '2026-10-03': { d: 1 } } },
      counts: { '2026-10-04': { l1: { towel: 0 } } },
    });
    expect(math.hasActivity('towel', '2026-10-01')).toBe(true); // income
    expect(math.hasActivity('towel', '2026-10-02')).toBe(false); // nothing
    expect(math.hasActivity('towel', '2026-10-03')).toBe(true); // departures → consumption
    expect(math.hasActivity('towel', '2026-10-04')).toBe(true); // counted 0
  });

  it('history before minDate is still replayed', () => {
    const math = make({ records: { towel: { '2026-09-01': { i: 5 } } } });
    expect(math.calculateTotal('towel', '2026-10-15')).toBe(5);
  });

  it('series matches calculateTotal day by day', () => {
    const state: Partial<StockState> = {
      records: { towel: { '2026-10-01': { i: 20 }, '2026-10-04': { m: 3 } } },
      groupRecords: { g1: { '2026-10-02': { d: 2 }, '2026-10-05': { d: 1 } } },
    };
    const math = make(state);
    const s = math.series({ id: 'towel', name: 'Towel', multipliers: { g1: 2 } }, '2026-10-06');
    for (const [date, f] of s) expect(f.total).toBe(math.calculateTotal('towel', date));
    expect(s.get('2026-10-05')?.total).toBe(1);
  });
});

/** Today's replay, copied as the reference: every item replayed from the earliest record. */
function referenceTotal(state: StockState, minDateStr: string, item: Item, target: string) {
  const math = createStockMath(state, { minDateStr });
  let total = 0;
  for (const d of dateRange(math.earliestDate(), target))
    total = math.dayFigures(item, d, total).total;
  return total;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generated(seed: number): StockState {
  const r = rng(seed);
  const pick = (p: number) => r() < p;
  const n = (max: number) => Math.floor(r() * max);
  const items: Item[] = [
    { id: 'towel', name: 'Towel', multipliers: { g1: 2, g2: 1 } },
    { id: 'soap', name: 'Soap', multipliers: { g2: 3 } },
    { id: 'sheet', name: 'Sheet', multipliers: {} },
  ];
  const state: StockState = {
    items,
    records: {},
    groups: [
      { id: 'g1', name: 'DOUBLE' },
      { id: 'g2', name: 'SINGLE' },
    ],
    groupRecords: {},
    counts: {},
  };
  for (const d of dateRange('2026-08-01', '2026-10-31')) {
    for (const item of items) {
      const rec: Record<string, number> = {};
      if (pick(0.3)) rec.i = n(40);
      if (pick(0.1)) rec.c = n(5);
      if (pick(0.05)) rec.mc = n(10);
      if (pick(0.04)) rec.m = n(80);
      if (Object.keys(rec).length) (state.records[item.id] ??= {})[d] = rec;
      // Room counts, including rooms that have been removed since
      if (pick(0.05)) {
        const byLoc = (state.counts[d] ??= {});
        for (const loc of ['l1', 'l2', 'gone']) if (pick(0.6)) (byLoc[loc] ??= {})[item.id] = n(30);
      }
    }
    for (const g of state.groups) if (pick(0.4)) (state.groupRecords[g.id] ??= {})[d] = { d: n(6) };
  }
  return state;
}

describe('stock math starts at the latest count', () => {
  const minDateStr = '2026-10-01';

  for (const seed of [1, 2, 3]) {
    it(`calculateTotal and series equal the full replay (seed ${seed})`, () => {
      const state = generated(seed);
      const math = createStockMath(state, { minDateStr });
      for (const item of state.items) {
        const s = math.series(item, '2026-11-10');
        expect(s.size).toBe(dateRange('2026-08-01', '2026-11-10').length);
        for (const d of dateRange('2026-07-25', '2026-11-10')) {
          const ref = referenceTotal(state, minDateStr, item, d);
          expect(math.calculateTotal(item.id, d), `${item.id} ${d}`).toBe(ref);
          if (d >= '2026-08-01') expect(s.get(d)?.total, `series ${item.id} ${d}`).toBe(ref);
        }
      }
    });
  }

  it('calculateTotal does not replay the days before the latest count', () => {
    const read: string[] = [];
    const departures = new Proxy<Record<string, { d: number }>>(
      { '2026-10-02': { d: 1 }, '2026-10-06': { d: 1 } },
      {
        get(target, key, receiver) {
          if (typeof key === 'string') read.push(key);
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const math = make({
      records: { towel: { '2026-10-01': { i: 20 } } },
      groupRecords: { g1: departures },
      counts: { '2026-10-05': { l1: { towel: 10 } } },
    });
    expect(math.calculateTotal('towel', '2026-10-07')).toBe(8);
    expect(read.filter((d) => d < '2026-10-05')).toEqual([]);
  });
});

describe('backupSchema', () => {
  it('reads old backups: blank strings become "not entered" and are pruned', () => {
    const data = backupSchema.parse({
      items: [{ id: '1', name: 'Towel', multipliers: { g: 2, h: 0 } }],
      records: {
        '1': { '2026-10-14': { c: '', i: 25, m: null, mc: null }, '2026-10-15': { c: '', i: '' } },
      },
      groups: [{ id: 'g', name: 'DOUBLE' }],
      groupRecords: { g: { '2026-10-14': { d: '' }, '2026-10-15': { d: 4 } } },
    });
    expect(data.items[0]!.multipliers).toEqual({ g: 2 });
    expect(data.records).toEqual({ '1': { '2026-10-14': { i: 25 } } });
    expect(data.groupRecords).toEqual({ g: { '2026-10-15': { d: 4 } } });
    expect(data.locations).toEqual([]);
    expect(data.counts).toEqual({});
  });

  it('rejects files that are not backups', () => {
    expect(backupSchema.safeParse({ hello: 1 }).success).toBe(false);
  });
});
