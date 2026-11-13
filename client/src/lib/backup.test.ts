import { emptyStockData, type StockData } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { backupCounts, hasData } from './backup';

const data = (extra: Partial<StockData>): StockData => ({ ...emptyStockData(), ...extra });

describe('hasData', () => {
  it('is false for an empty hotel', () => {
    expect(hasData(emptyStockData())).toBe(false);
  });

  it('is true when any list has something', () => {
    expect(hasData(data({ items: [{ id: 'i', name: 'Towel', multipliers: {} }] }))).toBe(true);
    expect(hasData(data({ groups: [{ id: 'g', name: 'Double' }] }))).toBe(true);
    expect(hasData(data({ locations: [{ id: 'l', name: 'Store' }] }))).toBe(true);
    expect(hasData(data({ tasks: [{ id: 't', name: 'Beds', description: '' }] }))).toBe(true);
    expect(hasData(data({ rooms: [{ id: 'r', number: '101' }] }))).toBe(true);
    expect(hasData(data({ roomTypes: [{ id: 'rt', name: 'Single' }] }))).toBe(true);
    expect(hasData(data({ roomUnits: [{ id: 'u', name: 'Bed' }] }))).toBe(true);
    expect(hasData(data({ roomStatuses: [{ id: 's', name: 'OK', color: 'green' }] }))).toBe(true);
  });
});

describe('backupCounts', () => {
  it('counts the lists and the rooms that have cleanings', () => {
    const d = data({
      items: [{ id: 'i', name: 'Towel', multipliers: {} }],
      locations: [
        { id: 'l1', name: 'Store' },
        { id: 'l2', name: 'Cellar' },
      ],
      rooms: [
        { id: 'r1', number: '101' },
        { id: 'r2', number: '102' },
        { id: 'r3', number: '103' },
      ],
      cleanings: {
        r1: [{ date: '2026-11-01', by: 'Ann' }],
        r2: [
          { date: '2026-11-02', by: 'Ann' },
          { date: '2026-10-02', by: 'Bo' },
        ],
      },
    });
    expect(backupCounts(d)).toEqual({ items: 1, groups: 0, locations: 2, rooms: 3, cleaned: 2 });
  });
});
