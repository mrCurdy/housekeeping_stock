import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import {
  addDays,
  backupSchema,
  CHECKLIST_DAYS,
  emptyStockData,
  formatDate,
  HISTORY_DAYS,
  normalizeStockData,
  parseDateLocal,
  pruneCleanings,
  pruneStock,
  pruneTasks,
  todayLocal,
} from '@app/shared';
import { logger } from '../../lib/logger';
import type { Db } from '../types';
import { createAuth } from './auth';
import { createChecklist } from './checklist';
import { createCounts } from './counts';
import { createGroups, createItems, createLocations } from './items';
import { migrations } from './migrations';
import { createDepartures, createRecords } from './records';
import { createRooms, createRoomStatuses, createRoomTypes, createRoomUnits } from './rooms';
import { CLEANING_ORDER, type Ctx, createRows, DATA_TABLES } from './rows';
import { createSettings, createStockCards } from './settings';
import { createTaskGroups, createTasks } from './tasks';

/**
 * SQLite store (better-sqlite3, synchronous). Every change runs in one transaction.
 *
 * Before the first change of each day the whole dataset is written as JSON to
 * backups/db-YYYY-MM-DD.json (= the data at the start of that day, in the Backup/Restore format);
 * copies older than `backupDays` are deleted. Checklist ticks, notes and task history older than
 * CHECKLIST_DAYS are dropped on start and with every change; room cleanings older than HISTORY_DAYS
 * too, except each room's latest. Stock data (records, departures, room
 * counts) older than HISTORY_DAYS + 2 days is dropped the same way, with `pruneStock` carrying the
 * totals over as counts. `today` is the clock (tests move it).
 *
 * On the first start of an empty database, `importFrom` (the old data/db.json) is imported and
 * renamed to *.imported.
 *
 * This file holds the connection, `write()`, `init`, backups and pruning. Row mapping is in
 * `rows.ts`; each repo area is a `createX(ctx)` in its own file (`items.ts`, `tasks.ts`…).
 */
export function createSqliteDb(
  filePath: string,
  {
    backupDays = 30,
    importFrom,
    today = () => formatDate(todayLocal()),
  }: { backupDays?: number; importFrom?: string; today?: () => string } = {},
): Db {
  const daysAgo = (n: number) => formatDate(addDays(parseDateLocal(today()), -n));
  let sql!: Database.Database;
  const backupDir = join(dirname(filePath), 'backups');
  const backupName = (date: string) => `db-${date}.json`;
  let lastBackup = '';

  const all = <T>(query: string, ...params: unknown[]) => sql.prepare(query).all(...params) as T[];
  const get = <T>(query: string, ...params: unknown[]) =>
    sql.prepare(query).get(...params) as T | undefined;
  const run = (query: string, ...params: unknown[]) => sql.prepare(query).run(...params);

  const prepare = (query: string) => sql.prepare(query);
  const transaction = <T>(fn: () => T): T => sql.transaction(fn)();
  const { snapshot, fill, readTasks, insertTask } = createRows({
    all,
    get,
    run,
    prepare,
    transaction,
  });

  /**
   * Stock data before `keepFrom` (2 days before the oldest selectable day) goes; the day before it,
   * K, keeps one carried-over `m` per item. A cheap SQL check first: it finds a row (date < K)
   * about once a day.
   */
  const pruneStockRows = () => {
    const keepFrom = daysAgo(HISTORY_DAYS + 2);
    const K = daysAgo(HISTORY_DAYS + 3);
    const old = (table: string) => !!get(`SELECT 1 FROM ${table} WHERE date < ? LIMIT 1`, K);
    if (!old('records') && !old('departures') && !old('counts')) return;
    const data = snapshot();
    if (!pruneStock(data, keepFrom)) return;
    for (const table of ['records', 'departures', 'counts'])
      run(`DELETE FROM ${table} WHERE date <= ?`, K);
    const rec = prepare('INSERT INTO records (item_id, date, m) VALUES (?, ?, ?)');
    for (const [itemId, byDate] of Object.entries(data.records)) {
      const m = byDate[K]?.m;
      if (m != null) rec.run(itemId, K, m);
    }
  };

  /**
   * Cleanings before today − HISTORY_DAYS go, except each room's latest. The cheap check: a room
   * with more than one cleaning and an old one.
   */
  const pruneCleaningRows = () => {
    const keepFrom = daysAgo(HISTORY_DAYS);
    const hit = get(
      'SELECT 1 FROM cleanings GROUP BY room_id HAVING MIN(date) < ? AND COUNT(*) > 1 LIMIT 1',
      keepFrom,
    );
    if (!hit) return;
    const cleanings: Record<string, { date: string; by: string; rowid: number }[]> = {};
    for (const r of all<{ room_id: string; date: string; by: string; rowid: number }>(
      `SELECT rowid, room_id, date, by FROM cleanings ${CLEANING_ORDER}`,
    )) {
      (cleanings[r.room_id] ??= []).push(r);
    }
    const before = Object.values(cleanings).flat();
    if (!pruneCleanings(cleanings, keepFrom)) return;
    const kept = new Set(Object.values(cleanings).flatMap((l) => l.map((c) => c.rowid)));
    const del = prepare('DELETE FROM cleanings WHERE rowid = ?');
    for (const c of before) if (!kept.has(c.rowid)) del.run(c.rowid);
  };

  /** The same 30-day rule as pruneChecklist(), as SQL deletes plus pruneTasks(); then the stock. */
  const prune = () => {
    const minDate = daysAgo(CHECKLIST_DAYS);
    run('DELETE FROM checks WHERE date < ?', minDate);
    run('DELETE FROM notes WHERE date < ?', minDate);
    pruneStockRows();
    pruneCleaningRows();
    const data = { ...emptyStockData(), tasks: readTasks() };
    if (!pruneTasks(data, minDate)) return;
    run('DELETE FROM tasks');
    data.tasks.forEach((t, pos) => insertTask(t, pos));
  };

  const dailyBackup = () => {
    const day = today();
    if (!backupDays || lastBackup === day) return;
    mkdirSync(backupDir, { recursive: true });
    const target = join(backupDir, backupName(day));
    if (!existsSync(target)) {
      // tmp + rename: a crash never leaves half a backup; an existing one was made before a restart
      writeFileSync(`${target}.tmp`, JSON.stringify(snapshot(), null, 2));
      renameSync(`${target}.tmp`, target);
    }
    lastBackup = day;
    const keep = new Set(Array.from({ length: backupDays }, (_, n) => backupName(daysAgo(n))));
    for (const f of readdirSync(backupDir)) {
      if (f.startsWith('db-') && !keep.has(f)) unlinkSync(join(backupDir, f));
    }
  };

  /** Runs one change: the daily backup first, then `fn` and pruning in one transaction. */
  const write = <T>(fn: () => T): T => {
    try {
      dailyBackup();
    } catch (err) {
      logger.warn({ err }, 'Daily backup failed');
    }
    return sql.transaction(() => {
      const out = fn();
      prune();
      return out;
    })();
  };

  // task_groups always holds the default group, so it doesn't count
  const isEmpty = () =>
    DATA_TABLES.every((t) => t === 'task_groups' || !get(`SELECT 1 FROM ${t} LIMIT 1`));

  const importJson = (path: string) => {
    const parsed = backupSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (!parsed.success) throw new Error(`${path} is not a valid stock data file`);
    sql.transaction(() => fill(parsed.data))();
    renameSync(path, `${path}.imported`);
    logger.info(`Imported ${path} into ${filePath}`);
  };

  const ctx: Ctx = { all, get, run, prepare, transaction, write };

  return {
    driver: 'sqlite',

    async init() {
      mkdirSync(dirname(filePath), { recursive: true });
      sql = new Database(filePath);
      sql.pragma('journal_mode = WAL');
      sql.exec(
        'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
      );
      const applied = new Set(all<{ id: number }>('SELECT id FROM _migrations').map((r) => r.id));
      for (const m of migrations) {
        if (applied.has(m.id)) continue;
        sql.transaction(() => {
          sql.exec(m.sql);
          run(
            'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)',
            m.id,
            m.name,
            new Date().toISOString(),
          );
        })();
      }
      if (importFrom && existsSync(importFrom) && isEmpty()) importJson(importFrom);
      sql.transaction(prune)();
    },

    async close() {
      if (sql?.open) sql.close();
    },

    async snapshot() {
      return snapshot();
    },

    async replace(next) {
      write(() => fill(normalizeStockData(next)));
    },

    items: createItems(ctx),
    groups: createGroups(ctx),
    locations: createLocations(ctx),
    records: createRecords(ctx),
    departures: createDepartures(ctx),
    counts: createCounts(ctx),
    tasks: createTasks(ctx),
    taskGroups: createTaskGroups(ctx),
    checklist: createChecklist(ctx),
    stockCards: createStockCards(ctx),
    settings: createSettings(ctx),
    rooms: createRooms(ctx),
    roomUnits: createRoomUnits(ctx),
    roomTypes: createRoomTypes(ctx),
    roomStatuses: createRoomStatuses(ctx),
    auth: createAuth(ctx),
  };
}
