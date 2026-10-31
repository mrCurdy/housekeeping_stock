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
import { addDays, formatDate, todayLocal, type StockData } from '@app/shared';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';

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
  settings: { saluteText: 'Hurraa!' },
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
});
