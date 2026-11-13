import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addDays,
  backupSchema,
  createStockMath,
  dateRange,
  emptyStockData,
  formatDate,
  HISTORY_DAYS,
  todayLocal,
  type StockData,
} from '@app/shared';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { createSqliteDb } from '../src/db/sqlite/index';

const day = (n: number) => formatDate(addDays(todayLocal(), n));
const today = day(0);

/** A dataset that uses every part of StockData, in a non-alphabetical order. */
const sample = (): StockData => ({
  items: [
    { id: 'z-item', name: 'Towel', multipliers: { 'g-b': 2, 'g-a': 1 } },
    { id: 'a-item', name: 'Soap', multipliers: {} },
  ],
  groups: [
    { id: 'g-b', name: 'DOUBLE' },
    { id: 'g-a', name: 'TRIPLE' },
  ],
  locations: [
    { id: 'l-2', name: '2 level' },
    { id: 'l-1', name: '1 level' },
  ],
  records: { 'z-item': { [day(-2)]: { i: 10, m: 4 }, [day(-1)]: { c: 1, mc: 3 } } },
  groupRecords: { 'g-b': { [day(-1)]: { d: 5 } } },
  // l-gone is a removed room: its counts stay
  counts: { [day(-1)]: { 'l-1': { 'z-item': 7 }, 'l-gone': { 'a-item': 2.5 } } },
  tasks: [
    { id: 't-2', name: 'Mop', description: '', group: 'tg-2' },
    {
      id: 't-1',
      name: 'Bins',
      description: 'Empty all',
      added: day(-5),
      earlier: [{ name: 'Trash', description: '', until: day(-2) }],
    },
    { id: 't-3', name: 'Gone', description: '', added: day(-10), removed: day(-3) },
  ],
  taskGroups: [
    { id: 'tg-2', name: 'Service' },
    { id: 'default', name: '' },
  ],
  checks: { [day(-1)]: { 't-1': '2026-01-01T10:00:00.000Z' } },
  notes: { [day(-1)]: 'Order soap' },
  stockCards: ['overview', 'items', 'departures'],
  settings: { saluteText: 'Hurraa!', cleanGreenDays: 0, cleanYellowDays: 20 },
  rooms: [
    { id: 'r-b', number: '201', type: 'rt-2', note: 'Sea view' },
    { id: 'r-a', number: '101' },
  ],
  roomTypes: [
    { id: 'rt-2', name: 'Suite' },
    { id: 'rt-1', name: 'Double' },
  ],
  roomUnits: [
    { id: 'u-2', name: 'Shower' },
    { id: 'u-1', name: 'Bed' },
  ],
  roomStatuses: [
    { id: 's-2', name: 'Broken', color: 'red' },
    { id: 's-1', name: 'Fine', color: 'green' },
  ],
  unitStatus: {
    'r-b': {
      'u-2': { status: 's-2', by: 'Anna', at: '2026-01-01T10:00:00.000Z', note: 'Leaks' },
      'u-1': { status: 's-1', by: 'Mari', at: '2026-01-02T10:00:00.000Z' },
    },
  },
  cleanings: {
    'r-b': [
      { date: day(-1), by: 'Anna' },
      { date: day(-1), by: 'Mari' },
      { date: day(-9), by: 'Anna' },
    ],
  },
});

describe('SQLite driver', () => {
  let dir: string;
  const opened: Db[] = [];

  const open = async (env: Record<string, string> = {}) => {
    const config = loadConfig({
      NODE_ENV: 'test',
      SQLITE_PATH: join(dir, 'stock.db'),
      JSON_DB_PATH: join(dir, 'db.json'),
      ...env,
    });
    const db = await createDb(config);
    await db.init();
    opened.push(db);
    return db;
  };
  const backups = () => (existsSync(join(dir, 'backups')) ? readdirSync(join(dir, 'backups')) : []);
  const readBackup = (name: string) =>
    JSON.parse(readFileSync(join(dir, 'backups', name), 'utf8')) as StockData;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stock-sqlite-'));
  });
  afterEach(async () => {
    for (const db of opened.splice(0)) await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is the sqlite driver and starts empty', async () => {
    const db = await open();
    expect(db.driver).toBe('sqlite');
    expect((await db.snapshot()).items).toEqual([]);
  });

  it('replace() round-trips everything and keeps the order', async () => {
    const db = await open();
    await db.replace(sample());
    expect(await db.snapshot()).toEqual(sample());
    const snap = await db.snapshot();
    expect(snap.items.map((i) => i.id)).toEqual(['z-item', 'a-item']);
    expect(snap.groups.map((g) => g.id)).toEqual(['g-b', 'g-a']);
    expect(snap.locations.map((l) => l.id)).toEqual(['l-2', 'l-1']);
    expect(snap.tasks.map((t) => t.id)).toEqual(['t-2', 't-1', 't-3']);
    expect(snap.taskGroups.map((g) => g.id)).toEqual(['tg-2', 'default']);
  });

  it('starts with one checklist group; deleting moves tasks and keeps the last one', async () => {
    const db = await open();
    expect((await db.snapshot()).taskGroups).toEqual([{ id: 'default', name: '' }]);
    const service = await db.taskGroups.create('Service');
    const task = await db.tasks.create('Trays', '', today, service.id);
    expect(task.group).toBe(service.id);
    expect((await db.tasks.create('Bad', '', today, 'nope')).group).toBe('default');
    expect(await db.taskGroups.reorder([service.id])).toEqual([
      service,
      { id: 'default', name: '' },
    ]);
    expect(await db.taskGroups.delete(service.id)).toBe(true);
    const snap = await db.snapshot();
    expect(snap.taskGroups).toEqual([{ id: 'default', name: '' }]);
    expect(snap.tasks.find((t) => t.id === task.id)!.group).toBe('default');
    expect(await db.taskGroups.delete('default')).toBe('last');
    expect(await db.taskGroups.delete('nope')).toBe(false);
  });

  it('replace() replaces the old data and new rows go last', async () => {
    const db = await open();
    await db.items.create('Old');
    await db.replace(sample());
    const added = await db.items.create('Sheet');
    const task = await db.tasks.create('Dust', '', today);
    const snap = await db.snapshot();
    expect(snap.items.map((i) => i.name)).toEqual(['Towel', 'Soap', 'Sheet']);
    expect(snap.items[2]!.id).toBe(added.id);
    expect(snap.tasks.at(-1)!.id).toBe(task.id);
  });

  it('keeps the data after a restart', async () => {
    const db = await open();
    await db.replace(sample());
    await db.close();
    expect(await (await open()).snapshot()).toEqual(sample());
  });

  it('restores an old backup without rooms', async () => {
    const db = await open();
    await db.replace(sample());
    const {
      rooms: _r,
      roomTypes: _t,
      roomUnits: _u,
      roomStatuses: _s,
      unitStatus: _us,
      cleanings: _c,
      ...old
    } = sample();
    await db.replace(backupSchema.parse({ ...old, settings: { saluteText: 'Hurraa!' } }));
    const snap = await db.snapshot();
    expect(snap.rooms).toEqual([]);
    expect(snap.roomUnits).toEqual([]);
    expect(snap.unitStatus).toEqual({});
    expect(snap.cleanings).toEqual({});
    expect(snap.settings).toEqual({ saluteText: 'Hurraa!' });
    expect(snap.items).toEqual(sample().items);
  });

  it('stores the cleaning thresholds as numbers', async () => {
    const db = await open();
    expect(await db.settings.update({ cleanGreenDays: 0, cleanYellowDays: 7 })).toEqual({
      cleanGreenDays: 0,
      cleanYellowDays: 7,
    });
    await db.close();
    expect((await (await open()).snapshot()).settings).toEqual({
      cleanGreenDays: 0,
      cleanYellowDays: 7,
    });
  });

  describe('rooms', () => {
    it('creates, edits and deletes room cards; numbers are unique', async () => {
      const db = await open();
      const suite = await db.roomTypes.create('Suite');
      const room = await db.rooms.create({ number: '101', type: suite.id, note: 'Sea view' });
      expect(room).toEqual({
        id: expect.any(String),
        number: '101',
        type: suite.id,
        note: 'Sea view',
      });
      if (!room || room === 'duplicate') throw new Error('not created');
      expect(await db.rooms.create({ number: '101' })).toBe('duplicate');
      expect(await db.rooms.create({ number: '102', type: 'nope' })).toBeNull();
      const other = await db.rooms.create({ number: '102', type: '', note: ' ' });
      expect(other).toEqual({ id: expect.any(String), number: '102' });
      expect(await db.rooms.update(room.id, { number: '102' })).toBe('duplicate');
      expect(await db.rooms.update(room.id, { note: '', type: '' })).toEqual({
        id: room.id,
        number: '101',
      });
      expect(await db.rooms.update(room.id, { number: '103' })).toEqual({
        id: room.id,
        number: '103',
      });
      expect(await db.rooms.update('nope', { number: '1' })).toBeNull();
      expect(await db.rooms.update(room.id, { type: 'nope' })).toBeNull();

      const unit = await db.roomUnits.create('Bed');
      expect(
        await db.rooms.setUnitStatus(room.id, unit.id, {
          status: 'fix',
          by: 'Anna',
          note: 'Squeaks',
        }),
      ).toEqual({ status: 'fix', by: 'Anna', at: expect.any(String), note: 'Squeaks' });
      expect(
        await db.rooms.setUnitStatus(room.id, unit.id, { status: 'nope', by: 'A' }),
      ).toBeNull();
      expect(await db.rooms.setUnitStatus(room.id, 'nope', { status: 'ok', by: 'A' })).toBeNull();
      expect(await db.rooms.setUnitStatus('nope', unit.id, { status: 'ok', by: 'A' })).toBeNull();
      expect(await db.rooms.addCleaning(room.id, { date: day(-3), by: 'Anna' })).toEqual([
        { date: day(-3), by: 'Anna' },
      ]);
      expect(await db.rooms.addCleaning(room.id, { date: today, by: 'Mari' })).toEqual([
        { date: today, by: 'Mari' },
        { date: day(-3), by: 'Anna' },
      ]);
      expect(await db.rooms.addCleaning('nope', { date: today, by: 'Mari' })).toBeNull();

      expect(await db.rooms.delete(room.id)).toBe(true);
      expect(await db.rooms.delete(room.id)).toBe(false);
      const snap = await db.snapshot();
      expect(snap.rooms.map((r) => r.number)).toEqual(['102']);
      expect(snap.unitStatus).toEqual({});
      expect(snap.cleanings).toEqual({});
    });

    it('removing a unit, status or type applies to every card', async () => {
      const db = await open();
      const suite = await db.roomTypes.create('Suite');
      const room = (await db.rooms.create({ number: '1', type: suite.id })) as { id: string };
      const bed = await db.roomUnits.create('Bed');
      const tv = await db.roomUnits.create('TV');
      await db.rooms.setUnitStatus(room.id, bed.id, { status: 'fix', by: 'A' });
      await db.rooms.setUnitStatus(room.id, tv.id, { status: 'attention', by: 'A' });

      expect(await db.roomUnits.reorder([tv.id])).toEqual([tv, bed]);
      expect(await db.roomUnits.delete(tv.id)).toBe(true);
      // deleting a default status stores the remaining defaults; its units go back to the first
      expect(await db.roomStatuses.delete('fix')).toBe(true);
      let snap = await db.snapshot();
      expect(snap.roomUnits).toEqual([bed]);
      expect(snap.roomStatuses.map((s) => s.id)).toEqual(['ok', 'attention']);
      expect(snap.unitStatus).toEqual({});

      expect(await db.roomTypes.delete(suite.id)).toBe(true);
      expect((await db.snapshot()).rooms).toEqual([{ id: room.id, number: '1' }]);

      expect(await db.roomStatuses.delete('nope')).toBe(false);
      expect(await db.roomStatuses.delete('ok')).toBe(true);
      expect(await db.roomStatuses.delete('attention')).toBe('last');
      snap = await db.snapshot();
      expect(snap.roomStatuses.map((s) => s.id)).toEqual(['attention']);
    });

    it('edits statuses, starting from the defaults', async () => {
      const db = await open();
      const blue = await db.roomStatuses.create({ name: 'Ordered', color: 'blue' });
      expect(blue).toEqual({ id: expect.any(String), name: 'Ordered', color: 'blue' });
      expect((await db.snapshot()).roomStatuses.map((s) => s.id)).toEqual([
        'ok',
        'attention',
        'fix',
        blue.id,
      ]);
      expect(await db.roomStatuses.update('ok', { name: 'Fine' })).toEqual({
        id: 'ok',
        name: 'Fine',
        color: 'green',
      });
      expect(await db.roomStatuses.update('nope', { name: 'X' })).toBeNull();
      const order = await db.roomStatuses.reorder([blue.id, 'fix']);
      expect(order.map((s) => s.id)).toEqual([blue.id, 'fix', 'ok', 'attention']);
      expect(await db.roomTypes.rename('nope', 'X')).toBeNull();
    });
  });

  describe('import from db.json', () => {
    it('imports it on the first start and renames it', async () => {
      // the old file format: '' blanks
      const old = { ...sample(), records: { 'z-item': { [day(-2)]: { i: 10, m: 4, c: '' } } } };
      writeFileSync(join(dir, 'db.json'), JSON.stringify(old));
      const db = await open();
      const snap = await db.snapshot();
      expect(snap.items).toEqual(sample().items);
      expect(snap.records).toEqual({ 'z-item': { [day(-2)]: { i: 10, m: 4 } } });
      expect(existsSync(join(dir, 'db.json'))).toBe(false);
      expect(existsSync(join(dir, 'db.json.imported'))).toBe(true);
    });

    it('does not import into a database that has data', async () => {
      const db = await open();
      await db.items.create('Mine');
      await db.close();
      writeFileSync(join(dir, 'db.json'), JSON.stringify(sample()));
      const snap = await (await open()).snapshot();
      expect(snap.items.map((i) => i.name)).toEqual(['Mine']);
      expect(existsSync(join(dir, 'db.json'))).toBe(true);
    });

    it('refuses a file that is not stock data', async () => {
      writeFileSync(join(dir, 'db.json'), JSON.stringify({ foo: 1 }));
      await expect(open()).rejects.toThrow(/not a valid stock data file/);
    });
  });

  describe('daily backup', () => {
    it('writes the start-of-day data before the first change of the day, once', async () => {
      const db = await open();
      await db.replace(sample());
      expect(backups()).toEqual([`db-${today}.json`]);
      expect(readBackup(`db-${today}.json`).items).toEqual([]); // from before the restore
      await db.items.create('Later');
      expect(readBackup(`db-${today}.json`).items).toEqual([]);
    });

    it("keeps today's copy across a restart", async () => {
      const db = await open();
      await db.items.create('First');
      await db.close();
      const again = await open();
      await again.items.create('Second');
      expect(readBackup(`db-${today}.json`).items).toEqual([]);
    });

    it('deletes copies older than BACKUP_DAYS', async () => {
      mkdirSync(join(dir, 'backups'));
      const old = `db-${day(-3)}.json`;
      const recent = `db-${day(-1)}.json`;
      for (const f of [old, recent, 'other.json']) writeFileSync(join(dir, 'backups', f), '{}');
      const db = await open({ BACKUP_DAYS: '3' });
      await db.items.create('X');
      expect(backups().sort()).toEqual([recent, `db-${today}.json`, 'other.json'].sort());
    });

    it('is off with BACKUP_DAYS=0', async () => {
      const db = await open({ BACKUP_DAYS: '0' });
      await db.items.create('X');
      expect(backups()).toEqual([]);
    });
  });

  describe('checklist pruning', () => {
    const old = day(-31);
    const kept = day(-30);
    const withOld = (): StockData => ({
      ...sample(),
      tasks: [
        { id: 't-old', name: 'Old', description: '', added: day(-40), removed: day(-35) },
        {
          id: 't-1',
          name: 'Bins',
          description: '',
          added: day(-40),
          earlier: [{ name: 'Trash', description: '', until: day(-35) }],
        },
      ],
      checks: { [old]: { 't-1': 'x' }, [kept]: { 't-1': 'y' } },
      notes: { [old]: 'old', [kept]: 'kept' },
    });

    it('drops old ticks, notes and task history on start', async () => {
      writeFileSync(join(dir, 'db.json'), JSON.stringify(withOld()));
      const snap = await (await open()).snapshot();
      expect(snap.checks).toEqual({ [kept]: { 't-1': 'y' } });
      expect(snap.notes).toEqual({ [kept]: 'kept' });
      expect(snap.tasks).toEqual([{ id: 't-1', name: 'Bins', description: '' }]);
    });

    it('drops them with a write too', async () => {
      const db = await open();
      await db.replace(withOld());
      const snap = await db.snapshot();
      expect(Object.keys(snap.checks)).toEqual([kept]);
      expect(Object.keys(snap.notes)).toEqual([kept]);
      expect(snap.tasks.map((t) => t.id)).toEqual(['t-1']);
    });
  });
  describe('stock pruning', () => {
    // The clock starts 30 days back, so the 60 seeded days are all kept; then it moves to `today`.
    let clock = day(-30);
    const keepFrom = day(-HISTORY_DAYS - 2);
    const K = day(-HISTORY_DAYS - 3);
    const visible = dateRange(day(-HISTORY_DAYS), today);

    /** 60 days of income, consumption, counts, departures and room counts (one removed room). */
    const sixtyDays = (): StockData => {
      const data: StockData = {
        ...emptyStockData(),
        items: [
          { id: 'towel', name: 'Towel', multipliers: { g: 2 } },
          { id: 'soap', name: 'Soap', multipliers: {} },
          { id: 'sheet', name: 'Sheet', multipliers: { g: 1 } }, // only consumed by departures
        ],
        groups: [{ id: 'g', name: 'DOUBLE' }],
        locations: [{ id: 'room', name: '1 level' }],
      };
      for (let n = -59; n <= 0; n++) {
        const d = day(n);
        (data.records.towel ??= {})[d] = n % 10 === 0 ? { m: 100 + n } : { i: 5, c: 3 };
        if (n % 3 === 0) (data.records.soap ??= {})[d] = { i: 2 };
        if (n % 4 === 0) (data.groupRecords.g ??= {})[d] = { d: 1 };
        if (n % 7 === 0) data.counts[d] = { room: { soap: 4 }, gone: { soap: 1 } };
      }
      return data;
    };
    const totals = (data: StockData) => {
      const math = createStockMath(data, { minDateStr: day(-HISTORY_DAYS) });
      return data.items.map((item) => visible.map((d) => math.calculateTotal(item.id, d)));
    };
    const openAt = async () => {
      const db = createSqliteDb(join(dir, 'stock.db'), { backupDays: 0, today: () => clock });
      await db.init();
      opened.push(db);
      return db;
    };
    const minDate = (data: StockData) =>
      [
        ...Object.values(data.records).flatMap(Object.keys),
        ...Object.values(data.groupRecords).flatMap(Object.keys),
        ...Object.keys(data.counts),
      ].sort()[0];

    beforeEach(() => {
      clock = day(-30);
    });

    it('drops rows before keepFrom on the first write of a later day, keeping every total', async () => {
      const db = await openAt();
      await db.replace(sixtyDays());
      const before = await db.snapshot();
      expect(minDate(before)).toBe(day(-59));

      clock = today;
      await db.locations.create('Later'); // any write
      const after = await db.snapshot();
      expect(minDate(after)).toBe(K);
      expect(Object.keys(after.counts).every((d) => d >= keepFrom)).toBe(true);
      expect(Object.values(after.groupRecords.g ?? {}).length).toBeGreaterThan(0);
      expect(Object.keys(after.groupRecords.g ?? {}).every((d) => d >= keepFrom)).toBe(true);
      const math = createStockMath(before, { minDateStr: K });
      expect(after.records.towel?.[K]).toEqual({ m: math.calculateTotal('towel', K) });
      expect(after.records.sheet?.[K]).toEqual({ m: math.calculateTotal('sheet', K) });
      expect(totals(after)).toEqual(totals(before));
    });

    it('prunes on start', async () => {
      await (await openAt()).replace(sixtyDays());
      await opened.pop()!.close();
      clock = today;
      expect(minDate(await (await openAt()).snapshot())).toBe(K);
    });

    it("drops old cleanings but keeps each room's latest", async () => {
      clock = today;
      const db = await openAt();
      const old = day(-HISTORY_DAYS - 1);
      await db.replace({
        ...emptyStockData(),
        rooms: [
          { id: 'a', number: '1' },
          { id: 'b', number: '2' },
          { id: 'c', number: '3' },
        ],
        cleanings: {
          a: [
            { date: day(-2), by: 'New' },
            { date: day(-HISTORY_DAYS), by: 'Edge' },
            { date: old, by: 'Old' },
          ],
          b: [
            { date: old, by: 'Latest' },
            { date: day(-HISTORY_DAYS - 9), by: 'Older' },
          ],
          c: [{ date: day(-200), by: 'Only' }],
        },
      });
      expect((await db.snapshot()).cleanings).toEqual({
        a: [
          { date: day(-2), by: 'New' },
          { date: day(-HISTORY_DAYS), by: 'Edge' },
        ],
        b: [{ date: old, by: 'Latest' }],
        c: [{ date: day(-200), by: 'Only' }],
      });
    });

    it('prunes a restored old backup', async () => {
      clock = today;
      const db = await openAt();
      const old = sixtyDays();
      await db.replace(old);
      const snap = await db.snapshot();
      expect(minDate(snap)).toBe(K);
      expect(totals(snap)).toEqual(totals(old));
    });
  });
});
