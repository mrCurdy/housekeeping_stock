import { emptyStockData, type StockData } from '@app/shared';
import { describe, expect, it } from 'vitest';
import {
  allGreen,
  cleaningDays,
  matchesSearch,
  roomLevel,
  roomLevels,
  roomUrgency,
  viewCleaning,
  viewRooms,
  worstStatus,
  type RoomView,
} from './roomView';

const by = { by: 'Ann', at: '2026-11-01T10:00:00.000Z' };

/** Rooms 101, 102, 115, 201, 205 with two units and the default + one extra (blue) status. */
function data(): StockData {
  const d = emptyStockData();
  d.rooms = ['205', '101', '115', '201', '102'].map((number) => ({ id: `r${number}`, number }));
  d.roomUnits = [
    { id: 'bed', name: 'Bed' },
    { id: 'shower', name: 'Shower' },
  ];
  d.roomStatuses = [
    { id: 'ok', name: 'OK', color: 'green' },
    { id: 'attention', name: 'Needs attention', color: 'yellow' },
    { id: 'fix', name: 'Needs fixing', color: 'red' },
    { id: 'paint', name: 'Paint', color: 'blue' },
  ];
  return d;
}

const view = (over: Partial<RoomView> = {}): RoomView => ({
  level: null,
  sort: 'number',
  hideGreen: false,
  ...over,
});
const numbers = (d: StockData, v: RoomView) => viewRooms(d, v).map((r) => r.number);

describe('roomLevel / roomLevels', () => {
  it('takes the first character, trimmed', () => {
    expect(roomLevel('101')).toBe('1');
    expect(roomLevel('  205')).toBe('2');
    expect(roomLevel('B2')).toBe('B');
  });
  it('lists the distinct levels in natural order', () => {
    const rooms = ['305', '101', 'B2', '115', '205', '9'].map((number) => ({ number }));
    expect(roomLevels(rooms)).toEqual(['1', '2', '3', '9', 'B']);
    expect(roomLevels([])).toEqual([]);
  });
});

describe('roomUrgency / allGreen', () => {
  it('ranks red > yellow > an extra colour > green', () => {
    const d = data();
    d.unitStatus = {
      r101: { bed: { status: 'fix', ...by }, shower: { status: 'attention', ...by } },
      r102: { bed: { status: 'attention', ...by }, shower: { status: 'paint', ...by } },
      r115: { shower: { status: 'paint', ...by } },
    };
    expect(roomUrgency(d, 'r101')).toBe(3);
    expect(roomUrgency(d, 'r102')).toBe(2);
    expect(roomUrgency(d, 'r115')).toBe(1);
    expect(roomUrgency(d, 'r201')).toBe(0);
  });
  it('counts an unstored status as the first one', () => {
    const d = data();
    expect(allGreen(d, 'r101')).toBe(true);
    d.roomStatuses = [d.roomStatuses[1]!, d.roomStatuses[0]!]; // yellow first now
    expect(allGreen(d, 'r101')).toBe(false);
    expect(roomUrgency(d, 'r101')).toBe(2);
  });
  it('worstStatus is the status roomUrgency ranks; none without units', () => {
    const d = data();
    d.unitStatus = {
      r101: { bed: { status: 'attention', ...by }, shower: { status: 'fix', ...by } },
      r102: { shower: { status: 'paint', ...by } },
    };
    expect(worstStatus(d, 'r101')?.id).toBe('fix');
    expect(worstStatus(d, 'r102')?.id).toBe('paint');
    expect(worstStatus(d, 'r201')?.id).toBe('ok');
    d.roomUnits = [];
    expect(worstStatus(d, 'r101')).toBeUndefined();
  });
});

describe('viewRooms', () => {
  it('sorts by number by default and filters a level', () => {
    const d = data();
    expect(numbers(d, view())).toEqual(['101', '102', '115', '201', '205']);
    expect(numbers(d, view({ level: '2' }))).toEqual(['201', '205']);
  });

  it('sorts by attention, ties by number', () => {
    const d = data();
    d.unitStatus = {
      r205: { bed: { status: 'fix', ...by } },
      r201: { bed: { status: 'paint', ...by } },
      r115: { shower: { status: 'attention', ...by } },
      r102: { bed: { status: 'fix', ...by } },
    };
    expect(numbers(d, view({ sort: 'attention' }))).toEqual(['102', '205', '115', '201', '101']);
  });

  it('hides all-green rooms, unstored statuses counting as the first', () => {
    const d = data();
    d.unitStatus = { r115: { bed: { status: 'attention', ...by } } };
    expect(numbers(d, view({ hideGreen: true }))).toEqual(['115']);
  });

  it('ignores hide-green while there are no units', () => {
    const d = data();
    d.roomUnits = [];
    expect(numbers(d, view({ hideGreen: true }))).toHaveLength(5);
  });

  it('combines a level filter with a sort', () => {
    const d = data();
    d.unitStatus = { r115: { bed: { status: 'fix', ...by } } };
    expect(numbers(d, view({ level: '1', sort: 'attention' }))).toEqual(['115', '101', '102']);
  });

  it('default order is level by level, then number', () => {
    const d = data();
    d.rooms = ['112', '003', '101', '001', '002'].map((number) => ({ id: `r${number}`, number }));
    expect(numbers(d, view())).toEqual(['001', '002', '003', '101', '112']);
    d.rooms = ['99', '205', '1010', '101'].map((number) => ({ id: `r${number}`, number }));
    expect(numbers(d, view())).toEqual(['101', '1010', '205', '99']);
    expect(numbers(d, view({ level: '1' }))).toEqual(['101', '1010']);
  });

  it('ties of a sort fall back to level, then number', () => {
    const d = data();
    d.rooms = ['99', '205', '1010', '101'].map((number) => ({ id: `r${number}`, number }));
    expect(numbers(d, view({ sort: 'attention' }))).toEqual(['101', '1010', '205', '99']);
  });
});

describe('search', () => {
  const types = [
    { id: 'dbl', name: 'Double' },
    { id: 'sgl', name: 'Single' },
  ];
  const room = (number: string, type?: string) => ({ id: `r${number}`, number, type });

  it('matches a number by prefix, digits in order', () => {
    expect(matchesSearch(room('301'), '3', types)).toBe(true);
    expect(matchesSearch(room('315'), '3', types)).toBe(true);
    expect(matchesSearch(room('103'), '3', types)).toBe(false);
    expect(matchesSearch(room('305'), '30', types)).toBe(true);
    expect(matchesSearch(room('315'), '30', types)).toBe(false);
    expect(matchesSearch(room('001'), '001', types)).toBe(true);
    expect(matchesSearch(room('B12'), ' b1 ', types)).toBe(true);
  });

  it("matches the start of the room type's name, any case", () => {
    expect(matchesSearch(room('101', 'dbl'), 'dou', types)).toBe(true);
    expect(matchesSearch(room('101', 'dbl'), 'DOU', types)).toBe(true);
    expect(matchesSearch(room('101', 'dbl'), 'ouble', types)).toBe(false);
    expect(matchesSearch(room('101', 'sgl'), 'dou', types)).toBe(false);
    expect(matchesSearch(room('101'), 'dou', types)).toBe(false);
  });

  it('an empty or space-only query matches every room', () => {
    expect(matchesSearch(room('101'), '', types)).toBe(true);
    expect(matchesSearch(room('101'), '   ', types)).toBe(true);
    const d = data();
    expect(viewRooms(d, { ...view({ level: '2' }), search: '  ' }).map((r) => r.number)).toEqual([
      '201',
      '205',
    ]);
  });

  it('ignores the level filter but keeps the sort and hide-green', () => {
    const d = data();
    d.roomTypes = types;
    d.rooms = d.rooms.map((r) => (r.number.endsWith('5') ? { ...r, type: 'dbl' } : r));
    const searched = (over: Partial<RoomView>, search: string) =>
      viewRooms(d, { ...view(over), search }).map((r) => r.number);
    expect(searched({ level: '2' }, '1')).toEqual(['101', '102', '115']);
    expect(searched({ level: '1' }, 'dou')).toEqual(['115', '205']);
    d.unitStatus = { r115: { bed: { status: 'attention', ...by } } };
    expect(searched({ level: '2', sort: 'attention' }, '1')).toEqual(['115', '101', '102']);
    d.unitStatus = { r102: { bed: { status: 'fix', ...by } } };
    expect(searched({ level: '2', hideGreen: true }, '1')).toEqual(['102']);
  });
});

describe('viewCleaning', () => {
  const today = '2026-11-13';
  const cleaned = (date: string) => [{ date, by: 'Ann' }];
  const order = (
    d: StockData,
    over: { level?: string | null; dirtyFirst?: boolean; search?: string } = {},
  ) => viewCleaning(d, { level: null, dirtyFirst: false, ...over }, today).map((r) => r.number);

  it('off = level order, with the level filter', () => {
    const d = data();
    expect(order(d)).toEqual(['101', '102', '115', '201', '205']);
    expect(order(d, { level: '2' })).toEqual(['201', '205']);
  });

  it('dirty first: never cleaned on top, then most days since cleaning, ties by level order', () => {
    const d = data();
    d.cleanings = {
      r101: cleaned('2026-11-13'),
      r115: cleaned('2026-10-01'),
      r201: cleaned('2026-11-01'),
      r205: [
        { date: '2026-11-01', by: 'Ann' },
        { date: '2026-09-01', by: 'Ann' },
      ],
    };
    // 102 never cleaned; 115 43 days; 201 and 205 12 days (tie → level order); 101 today.
    expect(order(d, { dirtyFirst: true })).toEqual(['102', '115', '201', '205', '101']);
    expect(order(d, { dirtyFirst: false })).toEqual(['101', '102', '115', '201', '205']);
  });

  it('never-cleaned ties keep level order', () => {
    const d = data();
    d.cleanings = { r102: cleaned('2026-11-01') };
    expect(order(d, { dirtyFirst: true })).toEqual(['101', '115', '201', '205', '102']);
  });

  it('a search looks across levels (the level waits) and keeps dirty-first', () => {
    const d = data();
    d.roomTypes = [{ id: 'dbl', name: 'Double' }];
    d.rooms = d.rooms.map((r) => (r.number.endsWith('5') ? { ...r, type: 'dbl' } : r));
    d.cleanings = { r115: cleaned('2026-11-10') };
    expect(order(d, { level: '2', search: '1' })).toEqual(['101', '102', '115']);
    expect(order(d, { level: '1', search: 'dou' })).toEqual(['115', '205']);
    expect(order(d, { level: '2', search: 'dou', dirtyFirst: true })).toEqual(['205', '115']);
    expect(order(d, { level: '2', search: '  ' })).toEqual(['201', '205']);
  });
});

describe('cleaningDays', () => {
  const today = '2026-11-13';
  it('days since the latest cleaning, coloured at the green/yellow/red thresholds', () => {
    const d = data(); // defaults: green ≤ 15, yellow ≤ 29
    const at = (date: string) => {
      d.cleanings = { r101: [{ date, by: 'Ann' }] };
      return cleaningDays(d, 'r101', today);
    };
    expect(at('2026-11-13')).toEqual({ days: 0, color: 'green' });
    expect(at('2026-10-29')).toEqual({ days: 15, color: 'green' });
    expect(at('2026-10-28')).toEqual({ days: 16, color: 'yellow' });
    expect(at('2026-10-15')).toEqual({ days: 29, color: 'yellow' });
    expect(at('2026-10-14')).toEqual({ days: 30, color: 'red' });
  });

  it('uses the stored thresholds; never cleaned = null, red', () => {
    const d = data();
    d.settings = { cleanGreenDays: 2, cleanYellowDays: 5 };
    d.cleanings = { r101: [{ date: '2026-11-10', by: 'Ann' }] };
    expect(cleaningDays(d, 'r101', today)).toEqual({ days: 3, color: 'yellow' });
    expect(cleaningDays(d, 'r102', today)).toEqual({ days: null, color: 'red' });
  });
});
