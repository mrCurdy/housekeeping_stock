import { describe, expect, it } from 'vitest';
import {
  cleaningLevel,
  cleanThresholds,
  latestCleaning,
  pruneCleanings,
  removeRoomIn,
  removeStatusIn,
  removeTypeIn,
  removeUnitIn,
  roomStatusList,
  sortRooms,
  unitStatusOf,
} from './rooms';
import {
  backupSchema,
  cleaningSchema,
  roomCreateSchema,
  roomPatchSchema,
  roomStatusCreateSchema,
  settingsPatchSchema,
  unitStatusSchema,
} from './schemas';
import {
  DEFAULT_CLEAN_DAYS,
  DEFAULT_ROOM_STATUSES,
  emptyStockData,
  ROOM_COLORS,
  ROOM_NOTE_MAX,
  type StockData,
} from './types';

const TODAY = '2026-11-13';

/** Two rooms, two units, a type, custom statuses, a status and cleanings in room r1. */
const sample = (): StockData => {
  const d = emptyStockData();
  d.rooms = [
    { id: 'r1', number: '101', type: 't1', note: 'Sea view' },
    { id: 'r2', number: '102', type: 't1' },
  ];
  d.roomTypes = [{ id: 't1', name: 'Double' }];
  d.roomUnits = [
    { id: 'u1', name: 'Bed' },
    { id: 'u2', name: 'Shower' },
  ];
  d.roomStatuses = [
    { id: 's1', name: 'OK', color: 'green' },
    { id: 's2', name: 'Broken', color: 'red' },
  ];
  d.unitStatus = {
    r1: { u1: { status: 's2', by: 'Ann', at: '2026-11-12T10:00:00.000Z', note: 'Leg' } },
    r2: { u2: { status: 's2', by: 'Bob', at: '2026-11-12T11:00:00.000Z' } },
  };
  d.cleanings = {
    r1: [
      { date: '2026-11-10', by: 'Ann' },
      { date: '2026-09-01', by: 'Bob' },
    ],
  };
  return d;
};

describe('constants', () => {
  it('has the 3 main colours first, then 7 more', () => {
    expect(ROOM_COLORS).toHaveLength(10);
    expect(ROOM_COLORS.slice(0, 3)).toEqual(['green', 'yellow', 'red']);
  });

  it('defaults: three statuses and 15/29 days', () => {
    expect(DEFAULT_ROOM_STATUSES.map((s) => s.color)).toEqual(['green', 'yellow', 'red']);
    expect(DEFAULT_CLEAN_DAYS).toEqual({ green: 15, yellow: 29 });
  });

  it('a new dataset has no rooms', () => {
    const d = emptyStockData();
    expect(d.rooms).toEqual([]);
    expect(d.roomStatuses).toEqual([]);
    expect(d.unitStatus).toEqual({});
    expect(d.cleanings).toEqual({});
  });
});

describe('roomStatusList', () => {
  it('is the defaults while none is stored', () => {
    expect(roomStatusList(emptyStockData())).toEqual(DEFAULT_ROOM_STATUSES);
  });

  it('is the stored list otherwise', () => {
    expect(roomStatusList(sample()).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('returns a copy', () => {
    const d = emptyStockData();
    roomStatusList(d).pop();
    expect(roomStatusList(d)).toHaveLength(3);
  });
});

describe('unitStatusOf', () => {
  it('the stored status with who, when and note', () => {
    const got = unitStatusOf(sample(), 'r1', 'u1');
    expect(got.status.id).toBe('s2');
    expect(got.entry).toMatchObject({ by: 'Ann', note: 'Leg' });
  });

  it('the first status when nothing is stored', () => {
    const got = unitStatusOf(sample(), 'r1', 'u2');
    expect(got.status.id).toBe('s1');
    expect(got.entry).toBeUndefined();
  });

  it('the first status when the stored one is gone', () => {
    const d = sample();
    d.unitStatus.r1!.u1!.status = 'gone';
    expect(unitStatusOf(d, 'r1', 'u1').status.id).toBe('s1');
  });

  it('the first default status on a new dataset', () => {
    expect(unitStatusOf(emptyStockData(), 'x', 'y').status).toEqual(DEFAULT_ROOM_STATUSES[0]);
  });
});

describe('cleanThresholds', () => {
  it('defaults', () => {
    expect(cleanThresholds({})).toEqual(DEFAULT_CLEAN_DAYS);
  });

  it('the stored values', () => {
    expect(cleanThresholds({ cleanGreenDays: 7, cleanYellowDays: 10 })).toEqual({
      green: 7,
      yellow: 10,
    });
  });

  it('one stored value is combined with the other default', () => {
    expect(cleanThresholds({ cleanGreenDays: 3 })).toEqual({ green: 3, yellow: 29 });
  });

  it('an invalid pair falls back to the defaults', () => {
    expect(cleanThresholds({ cleanGreenDays: 30 })).toEqual(DEFAULT_CLEAN_DAYS);
  });
});

describe('cleaningLevel', () => {
  const t = DEFAULT_CLEAN_DAYS;
  const ago = (n: number) => {
    const d = new Date(2026, 10, 13 - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('never cleaned is red', () => {
    expect(cleaningLevel(undefined, TODAY, t)).toEqual({ days: null, color: 'red' });
  });

  it('today is 0 days, green', () => {
    expect(cleaningLevel(TODAY, TODAY, t)).toEqual({ days: 0, color: 'green' });
  });

  it('threshold edges', () => {
    expect(cleaningLevel(ago(15), TODAY, t)).toEqual({ days: 15, color: 'green' });
    expect(cleaningLevel(ago(16), TODAY, t)).toEqual({ days: 16, color: 'yellow' });
    expect(cleaningLevel(ago(29), TODAY, t)).toEqual({ days: 29, color: 'yellow' });
    expect(cleaningLevel(ago(30), TODAY, t)).toEqual({ days: 30, color: 'red' });
  });

  it('counts calendar days across a month and a DST change', () => {
    expect(cleaningLevel('2026-10-20', TODAY, t).days).toBe(24);
    expect(cleaningLevel('2026-03-25', '2026-04-02', t).days).toBe(8);
  });

  it('green 0: only today is green', () => {
    expect(cleaningLevel(ago(1), TODAY, { green: 0, yellow: 1 }).color).toBe('yellow');
  });
});

describe('latestCleaning', () => {
  it('the newest one, or undefined', () => {
    expect(latestCleaning(sample(), 'r1')).toEqual({ date: '2026-11-10', by: 'Ann' });
    expect(latestCleaning(sample(), 'r2')).toBeUndefined();
  });
});

describe('sortRooms', () => {
  it('natural order: 2 < 10 < 101', () => {
    const rooms = ['101', '10', '2', 'B1', 'A2'].map((number) => ({ id: number, number }));
    expect(sortRooms(rooms).map((r) => r.number)).toEqual(['2', '10', '101', 'A2', 'B1']);
  });

  it('does not change the input', () => {
    const rooms = [
      { id: 'a', number: '10' },
      { id: 'b', number: '2' },
    ];
    sortRooms(rooms);
    expect(rooms[0]!.id).toBe('a');
  });
});

describe('remove rules', () => {
  it('removeUnitIn drops the unit and its statuses', () => {
    const d = sample();
    removeUnitIn(d, 'u2');
    expect(d.roomUnits.map((u) => u.id)).toEqual(['u1']);
    expect(d.unitStatus).toEqual({ r1: { u1: expect.anything() } });
  });

  it('removeStatusIn resets its units to the first status', () => {
    const d = sample();
    expect(removeStatusIn(d, 's2')).toBe(true);
    expect(d.roomStatuses.map((s) => s.id)).toEqual(['s1']);
    expect(d.unitStatus).toEqual({});
    expect(unitStatusOf(d, 'r1', 'u1').status.id).toBe('s1');
  });

  it('removeStatusIn keeps units on other statuses', () => {
    const d = sample();
    d.unitStatus.r1!.u2 = { status: 's1', by: 'Ann', at: 'x' };
    removeStatusIn(d, 's2');
    expect(Object.keys(d.unitStatus)).toEqual(['r1']);
    expect(Object.keys(d.unitStatus.r1!)).toEqual(['u2']);
  });

  it('removeStatusIn on the defaults stores the remaining ones', () => {
    const d = emptyStockData();
    const [first, second] = DEFAULT_ROOM_STATUSES;
    expect(removeStatusIn(d, second!.id)).toBe(true);
    expect(d.roomStatuses.map((s) => s.id)).toEqual([first!.id, DEFAULT_ROOM_STATUSES[2]!.id]);
  });

  it('removeStatusIn refuses the last status and unknown ids', () => {
    const d = sample();
    removeStatusIn(d, 's2');
    expect(removeStatusIn(d, 's1')).toBe(false);
    expect(removeStatusIn(d, 'nope')).toBe(false);
    expect(d.roomStatuses).toHaveLength(1);
  });

  it('removeTypeIn clears the type on its rooms', () => {
    const d = sample();
    removeTypeIn(d, 't1');
    expect(d.roomTypes).toEqual([]);
    expect(d.rooms.every((r) => !('type' in r))).toBe(true);
  });

  it('removeRoomIn drops the room, its statuses and cleanings', () => {
    const d = sample();
    removeRoomIn(d, 'r1');
    expect(d.rooms.map((r) => r.id)).toEqual(['r2']);
    expect(Object.keys(d.unitStatus)).toEqual(['r2']);
    expect(d.cleanings).toEqual({});
  });
});

describe('pruneCleanings', () => {
  it('drops old cleanings but keeps each room latest', () => {
    const cleanings = {
      r1: [
        { date: '2026-11-10', by: 'A' },
        { date: '2026-09-01', by: 'B' },
      ],
      r2: [
        { date: '2026-08-01', by: 'C' },
        { date: '2026-07-01', by: 'D' },
      ],
    };
    expect(pruneCleanings(cleanings, '2026-10-01')).toBe(true);
    expect(cleanings).toEqual({
      r1: [{ date: '2026-11-10', by: 'A' }],
      r2: [{ date: '2026-08-01', by: 'C' }],
    });
  });

  it('returns false when nothing is old', () => {
    const cleanings = { r1: [{ date: '2026-09-01', by: 'A' }] };
    expect(pruneCleanings(cleanings, '2026-10-01')).toBe(false);
    expect(cleanings.r1).toHaveLength(1);
  });
});

describe('room schemas', () => {
  it('room note is trimmed and limited', () => {
    expect(roomCreateSchema.parse({ number: ' 101 ', note: '  view ' })).toEqual({
      number: '101',
      note: 'view',
    });
    expect(roomPatchSchema.parse({ note: '' })).toEqual({ note: '' });
    expect(roomPatchSchema.safeParse({ note: 'x'.repeat(ROOM_NOTE_MAX + 1) }).success).toBe(false);
    expect(roomPatchSchema.safeParse({ note: 'x'.repeat(ROOM_NOTE_MAX) }).success).toBe(true);
  });

  it('a room needs a number', () => {
    expect(roomCreateSchema.safeParse({ number: '  ' }).success).toBe(false);
  });

  it('status colour must be one of the palette', () => {
    expect(roomStatusCreateSchema.safeParse({ name: 'Wet', color: 'teal' }).success).toBe(true);
    expect(roomStatusCreateSchema.safeParse({ name: 'Wet', color: '#fff' }).success).toBe(false);
  });

  it('unit status and cleaning need a name', () => {
    expect(unitStatusSchema.safeParse({ status: 's1', by: ' ' }).success).toBe(false);
    expect(unitStatusSchema.parse({ status: 's1', by: ' Ann ', note: ' x ' })).toEqual({
      status: 's1',
      by: 'Ann',
      note: 'x',
    });
    expect(cleaningSchema.safeParse({ date: TODAY, by: '' }).success).toBe(false);
    expect(cleaningSchema.safeParse({ date: '13.11.2026', by: 'Ann' }).success).toBe(false);
  });

  it('thresholds: 0 <= green < yellow', () => {
    expect(settingsPatchSchema.safeParse({ cleanGreenDays: 0, cleanYellowDays: 1 }).success).toBe(
      true,
    );
    expect(settingsPatchSchema.safeParse({ cleanGreenDays: 5, cleanYellowDays: 5 }).success).toBe(
      false,
    );
    expect(settingsPatchSchema.safeParse({ cleanGreenDays: -1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ cleanYellowDays: 1.5 }).success).toBe(false);
  });
});

describe('backups with rooms', () => {
  const base = { items: [] };

  it('an old backup without rooms still loads', () => {
    const d = backupSchema.parse(base);
    expect(d.rooms).toEqual([]);
    expect(d.roomStatuses).toEqual([]);
    expect(d.unitStatus).toEqual({});
    expect(d.cleanings).toEqual({});
  });

  it('round-trips a dataset with rooms', () => {
    const d = sample();
    expect(backupSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('drops blank notes, unknown ids and empty maps', () => {
    const d = backupSchema.parse({
      ...base,
      rooms: [
        { id: 'r1', number: '1', type: 'gone', note: '   ' },
        { id: 'r2', number: '2', note: ' hi ' },
      ],
      roomUnits: [{ id: 'u1', name: 'Bed' }],
      unitStatus: {
        r1: { u1: { status: 'ok', by: 'A', at: 'x', note: ' ' }, gone: { status: 'ok' } },
        r2: { u1: { status: 'unknown', by: 'A', at: 'x' } },
        gone: { u1: { status: 'ok', by: 'A', at: 'x' } },
        r3: {},
      },
      cleanings: {
        r1: [
          { date: '2026-01-01', by: 'A' },
          { date: '2026-02-01', by: 'B' },
        ],
        r2: [],
        gone: [{ date: '2026-01-01', by: 'A' }],
      },
      settings: { cleanGreenDays: 10, cleanYellowDays: 5 },
    });
    expect(d.rooms).toEqual([
      { id: 'r1', number: '1' },
      { id: 'r2', number: '2', note: 'hi' },
    ]);
    expect(d.unitStatus).toEqual({ r1: { u1: { status: 'ok', by: 'A', at: 'x' } } });
    // Newest first
    expect(d.cleanings).toEqual({
      r1: [
        { date: '2026-02-01', by: 'B' },
        { date: '2026-01-01', by: 'A' },
      ],
    });
    expect(d.settings).toEqual({});
  });

  it('keeps valid thresholds', () => {
    const d = backupSchema.parse({ ...base, settings: { cleanGreenDays: 7, cleanYellowDays: 14 } });
    expect(d.settings).toEqual({ cleanGreenDays: 7, cleanYellowDays: 14 });
  });
});
