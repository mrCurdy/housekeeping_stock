import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStockMath } from '../public/js/stock.js';

const make = (overrides = {}) => {
  const state = {
    items: [{ id: 'towel', name: 'Towel', multipliers: { g1: 2 } }],
    records: {},
    groups: [{ id: 'g1', name: 'DOUBLE' }],
    groupRecords: {},
    counts: {},
    ...overrides,
  };
  return createStockMath(state, { minDateStr: '2026-10-01' });
};

test('income adds and departures × multiplier consume', () => {
  const math = make({
    records: { towel: { '2026-10-01': { i: 20 } } },
    groupRecords: { g1: { '2026-10-02': { d: 3 } } },
  });
  assert.equal(math.calculateTotal('towel', '2026-10-01'), 20);
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 14);
});

test('manual consumption replaces auto consumption; extra adds to it', () => {
  const math = make({
    records: { towel: { '2026-10-01': { i: 20 }, '2026-10-02': { mc: 1 }, '2026-10-03': { c: 1 } } },
    groupRecords: { g1: { '2026-10-02': { d: 3 }, '2026-10-03': { d: 1 } } },
  });
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 19);
  assert.equal(math.calculateTotal('towel', '2026-10-03'), 16);
});

test('a count is the end-of-day figure: that day\'s income is ignored', () => {
  const math = make({ records: { towel: { '2026-10-01': { i: 20, m: 7 } } } });
  assert.equal(math.calculateTotal('towel', '2026-10-01'), 7);
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 7);
});

test('room counts are summed and override the calculation', () => {
  const math = make({
    records: { towel: { '2026-10-01': { i: 100 } } },
    counts: { '2026-10-02': { l1: { towel: 10 }, l2: { towel: 5 } } },
  });
  assert.equal(math.roomSum('towel', '2026-10-02'), 15);
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 15);
});

test('a count typed on the Stock tab wins over room counts', () => {
  const math = make({
    records: { towel: { '2026-10-02': { m: 40 } } },
    counts: { '2026-10-02': { l1: { towel: 10 } } },
  });
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 40);
});

test('0 is a real count, not "not counted"', () => {
  const math = make({
    records: { towel: { '2026-10-01': { i: 9 } } },
    counts: { '2026-10-02': { l1: { towel: 0 } } },
  });
  assert.equal(math.roomSum('towel', '2026-10-02'), 0);
  assert.equal(math.calculateTotal('towel', '2026-10-02'), 0);
});

test('hasActivity: only days with consumption, income or a count', () => {
  const math = make({
    records: { towel: { '2026-10-01': { i: 20 }, '2026-10-02': { c: '', i: '', m: null, mc: null } } },
    groupRecords: { g1: { '2026-10-03': { d: 1 } } },
    counts: { '2026-10-04': { l1: { towel: 0 } } },
  });
  assert.equal(math.hasActivity('towel', '2026-10-01'), true);  // income
  assert.equal(math.hasActivity('towel', '2026-10-02'), false); // blank placeholder record
  assert.equal(math.hasActivity('towel', '2026-10-03'), true);  // departures → consumption
  assert.equal(math.hasActivity('towel', '2026-10-04'), true);  // counted 0
  assert.equal(math.hasActivity('towel', '2026-10-05'), false); // nothing
});

test('history before minDate is still replayed', () => {
  const math = make({ records: { towel: { '2026-09-01': { i: 5 } } } });
  assert.equal(math.calculateTotal('towel', '2026-10-15'), 5);
});
