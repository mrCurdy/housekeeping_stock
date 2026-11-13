import { emptyStockData, type StockData } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { editData } from './mutations';

const sample = (): StockData => {
  const d = emptyStockData();
  d.records = { a: { '2026-11-13': { i: 2 } } };
  d.tasks = [{ id: 't', name: 'Mop', description: '' }];
  d.notes = { '2026-11-13': 'hi' };
  return d;
};

describe('editData', () => {
  it('copies only the named key; the rest is shared with the old dataset', () => {
    const prev = sample();
    const next = editData(prev, 'records', (d) => void (d.records.a!['2026-11-13'] = { i: 5 }));
    expect(next.records.a?.['2026-11-13']).toEqual({ i: 5 });
    expect(prev.records.a?.['2026-11-13']).toEqual({ i: 2 });
    expect(next.tasks).toBe(prev.tasks);
    expect(next.notes).toBe(prev.notes);
    expect(next.records).not.toBe(prev.records);
  });

  it('copies every key of a list', () => {
    const prev = sample();
    const next = editData(prev, ['tasks', 'notes'], (d) => {
      d.tasks[0]!.name = 'Sweep';
      delete d.notes['2026-11-13'];
    });
    expect(prev.tasks[0]!.name).toBe('Mop');
    expect(prev.notes).toEqual({ '2026-11-13': 'hi' });
    expect(next.tasks[0]!.name).toBe('Sweep');
    expect(next.records).toBe(prev.records);
  });
});
