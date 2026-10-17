import { describe, expect, it } from 'vitest';
import { backupSchema } from './schemas';
import { createStockMath, type StockState } from './stock';

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
