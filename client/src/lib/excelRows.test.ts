import { emptyStockData, type StockData } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { cleaningSheet, hasExcelData } from './excelRows';

const data = (extra: Partial<StockData>): StockData => ({ ...emptyStockData(), ...extra });

describe('cleaningSheet', () => {
  const d = data({
    roomTypes: [{ id: 'dbl', name: 'Double' }],
    rooms: [
      { id: 'r201', number: '201' },
      { id: 'r102', number: '102', type: 'dbl' },
      { id: 'r101', number: '101' },
      { id: 'r001', number: '001' },
    ],
    cleanings: {
      r102: [
        { date: '2026-11-10', by: 'Ann' },
        { date: '2026-10-20', by: 'Bob' },
        { date: '2026-10-01', by: 'Ann' },
      ],
      r101: [{ date: '2026-11-13', by: 'Eve' }],
    },
  });
  const rows = cleaningSheet(d, '2026-11-13', 'never');

  it('lists the rooms level by level', () => {
    expect(rows.map((r) => r.number)).toEqual(['001', '101', '102', '201']);
  });

  it('gives the latest cleaning, days ago, who and the earlier dates newest first', () => {
    expect(rows[2]).toEqual({
      number: '102',
      type: 'Double',
      last: '2026-11-10',
      days: 3,
      by: 'Ann',
      earlier: '2026-10-20, 2026-10-01',
    });
    expect(rows[1]).toMatchObject({ last: '2026-11-13', days: 0, by: 'Eve', earlier: '' });
  });

  it('says "never" for a room never cleaned, with days and who empty', () => {
    expect(rows[0]).toEqual({
      number: '001',
      type: '',
      last: 'never',
      days: '',
      by: '',
      earlier: '',
    });
  });
});

describe('hasExcelData', () => {
  it('is true with items or rooms, false without either', () => {
    expect(hasExcelData(emptyStockData())).toBe(false);
    expect(hasExcelData(data({ tasks: [{ id: 't', name: 'Beds', description: '' }] }))).toBe(false);
    expect(hasExcelData(data({ rooms: [{ id: 'r', number: '101' }] }))).toBe(true);
    expect(hasExcelData(data({ items: [{ id: 'i', name: 'Towel', multipliers: {} }] }))).toBe(true);
  });
});
