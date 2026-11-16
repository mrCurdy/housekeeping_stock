import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays,
  backupSchema,
  createStockMath,
  formatDate,
  parseDateLocal,
  roomStatusList,
  taskGroupList,
} from '@app/shared';
import { createSqliteDb } from '../src/db/sqlite/index';
import { seedData, SEED_DAYS } from '../src/seed/data';
import { seed } from '../src/seed/index';

const today = '2026-11-13';
const day = (o: number) => formatDate(addDays(parseDateLocal(today), o));

describe('seedData', () => {
  const data = seedData(today);

  it('has the hotel: 7 items, 3 departure groups, 3 task groups, 29 rooms', () => {
    expect(data.items).toHaveLength(7);
    expect(data.groups).toHaveLength(3);
    expect(taskGroupList(data.taskGroups)).toHaveLength(3);
    expect(data.tasks.length).toBeGreaterThanOrEqual(9);
    for (const g of data.taskGroups) expect(data.tasks.some((t) => t.group === g.id)).toBe(true);

    const numbers = data.rooms.map((r) => r.number);
    expect(numbers).toHaveLength(29);
    expect(numbers.filter((n) => n.startsWith('0'))).toEqual(['001', '002']);
    for (const level of ['1', '2', '3'])
      expect(numbers.filter((n) => n.startsWith(level))).toHaveLength(9);
    expect(new Set(numbers).size).toBe(29);
  });

  it('is a valid backup that refers only to known ids', () => {
    expect(backupSchema.safeParse(data).success).toBe(true);
    const statuses = new Set(roomStatusList(data).map((s) => s.id));
    const units = new Set(data.roomUnits.map((u) => u.id));
    const types = new Set(data.roomTypes.map((t) => t.id));
    for (const r of data.rooms) if (r.type) expect(types.has(r.type)).toBe(true);
    const unitGroups = new Set(data.roomUnitGroups.map((g) => g.id));
    expect(data.roomUnitGroups.map((g) => g.name)).toEqual([
      'Bathroom',
      'Electronics',
      'Furniture',
    ]);
    for (const g of unitGroups) expect(data.roomUnits.some((u) => u.group === g)).toBe(true);
    for (const u of data.roomUnits) expect(unitGroups.has(u.group ?? '')).toBe(true);
    for (const byUnit of Object.values(data.unitStatus))
      for (const [unit, s] of Object.entries(byUnit)) {
        expect(units.has(unit)).toBe(true);
        expect(statuses.has(s.status)).toBe(true);
      }
  });

  it('keeps every stock total positive over the seeded days', () => {
    const math = createStockMath(data, { minDateStr: day(-SEED_DAYS) });
    for (const item of data.items)
      for (let o = -SEED_DAYS; o <= 0; o++)
        expect(math.calculateTotal(item.id, day(o))).toBeGreaterThan(0);
  });

  it('is the same for the same day', () => {
    expect(seedData(today)).toEqual(data);
  });
});

describe('seed', () => {
  const dirs: string[] = [];
  const open = async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stock-seed-'));
    dirs.push(dir);
    const db = createSqliteDb(join(dir, 'stock.db'), { today: () => today });
    await db.init();
    return { db, dir };
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('fills an empty database with the demo data', async () => {
    const { db } = await open();
    expect(await seed(db, { today })).toEqual({ status: 'seeded' });
    const stored = await db.snapshot();
    expect(stored.rooms).toHaveLength(29);
    expect(stored.items).toHaveLength(7);
    expect(stored.tasks).toEqual(seedData(today).tasks);
    await db.close();
  });

  it('refuses a database with data, and with force backs it up first', async () => {
    const { db, dir } = await open();
    await db.items.create('Keep me');
    expect(await seed(db, { today })).toEqual({ status: 'refused' });
    expect((await db.snapshot()).items.map((i) => i.name)).toEqual(['Keep me']);

    const backupDir = join(dir, 'backups');
    const result = await seed(db, { today, force: true, backupDir });
    expect(result.status).toBe('seeded');
    expect(readdirSync(backupDir).some((f) => f.startsWith('pre-seed-'))).toBe(true);
    expect((await db.snapshot()).items).toHaveLength(7);
    await db.close();
  });
});
