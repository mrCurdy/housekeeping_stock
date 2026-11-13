import { randomUUID } from 'node:crypto';
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
  type AppSettings,
  addDays,
  backupSchema,
  CHECKLIST_DAYS,
  cleanRecord,
  type DayChecks,
  type DayCounts,
  type DayRecord,
  editTask,
  emptyStockData,
  formatDate,
  type Group,
  HISTORY_DAYS,
  groupOf,
  type Item,
  isTaskOn,
  itemCheckKey,
  type Location,
  type PinRole,
  newTask,
  normalizeStockData,
  parseDateLocal,
  pruneStock,
  pruneTasks,
  removeTaskFrom,
  removeTaskGroupIn,
  type Role,
  type StockCard,
  stockCardOrder,
  type StockData,
  type Task,
  type TaskGroup,
  taskGroupList,
  todayLocal,
} from '@app/shared';
import { logger } from '../../lib/logger';
import type { Db, NamedRepo } from '../types';
import { migrations } from './migrations';

/* Row shapes as stored (snake_case, missing values as NULL) */
interface NamedRow {
  id: string;
  name: string;
}
interface MultiplierRow {
  item_id: string;
  group_id: string;
  qty: number;
}
interface RecordRow {
  item_id: string;
  date: string;
  c: number | null;
  i: number | null;
  m: number | null;
  mc: number | null;
}
interface DepartureRow {
  group_id: string;
  date: string;
  d: number;
}
interface CountRow {
  date: string;
  location_id: string;
  item_id: string;
  value: number;
}
interface TaskRow {
  id: string;
  name: string;
  description: string;
  added: string | null;
  removed: string | null;
  earlier_json: string | null;
  group_id: string | null;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  name: r.name,
  description: r.description,
  ...(r.added && { added: r.added }),
  ...(r.removed && { removed: r.removed }),
  ...(r.earlier_json && { earlier: JSON.parse(r.earlier_json) as Task['earlier'] }),
  ...(r.group_id && { group: r.group_id }),
});
const taskParams = (t: Task) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  added: t.added ?? null,
  removed: t.removed ?? null,
  earlier_json: t.earlier?.length ? JSON.stringify(t.earlier) : null,
  group_id: t.group ?? null,
});

/** Tables holding the dataset (not the auth tables), in the order `replace()` fills them. */
const DATA_TABLES = [
  'items',
  'multipliers',
  'records',
  'groups',
  'departures',
  'locations',
  'counts',
  'tasks',
  'task_groups',
  'checks',
  'notes',
  'stock_cards',
  'settings',
] as const;
type NamedTable = 'items' | 'groups' | 'locations' | 'task_groups';

/**
 * SQLite store (better-sqlite3, synchronous). Every change runs in one transaction.
 *
 * Before the first change of each day the whole dataset is written as JSON to
 * backups/db-YYYY-MM-DD.json (= the data at the start of that day, in the Backup/Restore format);
 * copies older than `backupDays` are deleted. Checklist ticks, notes and task history older than
 * CHECKLIST_DAYS are dropped on start and with every change. Stock data (records, departures, room
 * counts) older than HISTORY_DAYS + 2 days is dropped the same way, with `pruneStock` carrying the
 * totals over as counts. `today` is the clock (tests move it).
 *
 * On the first start of an empty database, `importFrom` (the old data/db.json) is imported and
 * renamed to *.imported.
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

  /** Deletes every QR link and the counter sessions opened from them. */
  const deleteQrLinks = () => {
    run('DELETE FROM sessions WHERE link_id IS NOT NULL');
    run('DELETE FROM qr_links');
  };
  const nextPos = (table: NamedTable | 'tasks') =>
    get<{ n: number }>(`SELECT COALESCE(MAX(pos) + 1, 0) AS n FROM ${table}`)!.n;

  const readStockCards = () =>
    all<{ id: StockCard }>('SELECT id FROM stock_cards ORDER BY pos').map((r) => r.id);
  const writeStockCards = (order: StockCard[]) => {
    run('DELETE FROM stock_cards');
    const stmt = sql.prepare('INSERT INTO stock_cards (id, pos) VALUES (?, ?)');
    order.forEach((id, pos) => stmt.run(id, pos));
  };

  /** Settings are key/value rows; a missing row is the default. */
  const readSettings = (): AppSettings =>
    Object.fromEntries(
      all<{ key: string; value: string }>('SELECT key, value FROM settings').map((r) => [
        r.key,
        r.value,
      ]),
    );
  const writeSetting = (key: keyof AppSettings, value: string | undefined) => {
    if (value) {
      run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    } else run('DELETE FROM settings WHERE key = ?', key);
  };

  const readTasks = () => all<TaskRow>('SELECT * FROM tasks ORDER BY pos').map(toTask);
  const readTask = (id: string) => {
    const row = get<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
    return row && toTask(row);
  };
  const insertTask = (t: Task, pos: number) =>
    run(
      `INSERT INTO tasks (id, name, description, added, removed, earlier_json, group_id, pos)
       VALUES (@id, @name, @description, @added, @removed, @earlier_json, @group_id, @pos)`,
      { ...taskParams(t), pos },
    );
  const updateTask = (t: Task) =>
    run(
      `UPDATE tasks SET name = @name, description = @description, added = @added,
       removed = @removed, earlier_json = @earlier_json, group_id = @group_id WHERE id = @id`,
      taskParams(t),
    );
  /** Never empty: an empty table reads as the default group. */
  const readTaskGroups = () =>
    taskGroupList(all<NamedRow>('SELECT id, name FROM task_groups ORDER BY pos'));
  const writeTaskGroups = (groups: TaskGroup[]) => {
    run('DELETE FROM task_groups');
    const stmt = sql.prepare('INSERT INTO task_groups (id, name, pos) VALUES (?, ?, ?)');
    taskGroupList(groups).forEach((g, pos) => stmt.run(g.id, g.name, pos));
  };
  const dayChecks = (date: string): DayChecks =>
    Object.fromEntries(
      all<{ task_id: string; at: string }>(
        'SELECT task_id, at FROM checks WHERE date = ?',
        date,
      ).map((r) => [r.task_id, r.at]),
    );

  const snapshot = (): StockData => {
    const data = emptyStockData();
    const items = new Map<string, Item>();
    for (const r of all<NamedRow>('SELECT id, name FROM items ORDER BY pos')) {
      const item: Item = { id: r.id, name: r.name, multipliers: {} };
      items.set(r.id, item);
      data.items.push(item);
    }
    for (const r of all<MultiplierRow>('SELECT * FROM multipliers ORDER BY rowid')) {
      const item = items.get(r.item_id);
      if (item) item.multipliers[r.group_id] = r.qty;
    }
    data.groups = all<NamedRow>('SELECT id, name FROM groups ORDER BY pos');
    data.locations = all<NamedRow>('SELECT id, name FROM locations ORDER BY pos');
    for (const { item_id, date, ...rec } of all<RecordRow>(
      'SELECT * FROM records ORDER BY rowid',
    )) {
      const clean = cleanRecord(rec);
      if (clean) (data.records[item_id] ??= {})[date] = clean;
    }
    for (const r of all<DepartureRow>('SELECT * FROM departures ORDER BY rowid')) {
      (data.groupRecords[r.group_id] ??= {})[r.date] = { d: r.d };
    }
    for (const r of all<CountRow>('SELECT * FROM counts ORDER BY rowid')) {
      ((data.counts[r.date] ??= {})[r.location_id] ??= {})[r.item_id] = r.value;
    }
    data.tasks = readTasks();
    data.taskGroups = readTaskGroups();
    for (const r of all<{ date: string; task_id: string; at: string }>(
      'SELECT * FROM checks ORDER BY rowid',
    )) {
      (data.checks[r.date] ??= {})[r.task_id] = r.at;
    }
    for (const r of all<{ date: string; text: string }>('SELECT * FROM notes ORDER BY date')) {
      data.notes[r.date] = r.text;
    }
    data.stockCards = readStockCards();
    data.settings = readSettings();
    return data;
  };

  /** Deletes everything and inserts `data` (no backup, no transaction: callers wrap it). */
  const fill = (data: StockData) => {
    for (const table of DATA_TABLES) run(`DELETE FROM ${table}`);
    const named = (table: NamedTable, rows: NamedRow[]) => {
      const stmt = sql.prepare(`INSERT INTO ${table} (id, name, pos) VALUES (?, ?, ?)`);
      rows.forEach((r, pos) => stmt.run(r.id, r.name, pos));
    };
    named('items', data.items);
    named('groups', data.groups);
    named('locations', data.locations);
    const mult = sql.prepare('INSERT INTO multipliers (item_id, group_id, qty) VALUES (?, ?, ?)');
    for (const item of data.items) {
      for (const [groupId, qty] of Object.entries(item.multipliers))
        mult.run(item.id, groupId, qty);
    }
    const rec = sql.prepare(
      'INSERT INTO records (item_id, date, c, i, m, mc) VALUES (@item_id, @date, @c, @i, @m, @mc)',
    );
    for (const [itemId, byDate] of Object.entries(data.records)) {
      for (const [date, r] of Object.entries(byDate)) {
        rec.run({
          item_id: itemId,
          date,
          c: r.c ?? null,
          i: r.i ?? null,
          m: r.m ?? null,
          mc: r.mc ?? null,
        });
      }
    }
    const dep = sql.prepare('INSERT INTO departures (group_id, date, d) VALUES (?, ?, ?)');
    for (const [groupId, byDate] of Object.entries(data.groupRecords)) {
      for (const [date, r] of Object.entries(byDate)) dep.run(groupId, date, r.d);
    }
    const count = sql.prepare(
      'INSERT INTO counts (date, location_id, item_id, value) VALUES (?, ?, ?, ?)',
    );
    for (const [date, byLocation] of Object.entries(data.counts)) {
      for (const [locationId, byItem] of Object.entries(byLocation)) {
        for (const [itemId, value] of Object.entries(byItem))
          count.run(date, locationId, itemId, value);
      }
    }
    data.tasks.forEach((t, pos) => insertTask(t, pos));
    writeTaskGroups(data.taskGroups);
    const check = sql.prepare('INSERT INTO checks (date, task_id, at) VALUES (?, ?, ?)');
    for (const [date, byTask] of Object.entries(data.checks)) {
      for (const [taskId, at] of Object.entries(byTask)) check.run(date, taskId, at);
    }
    const note = sql.prepare('INSERT INTO notes (date, text) VALUES (?, ?)');
    for (const [date, text] of Object.entries(data.notes)) note.run(date, text);
    writeStockCards(data.stockCards);
    writeSetting('saluteText', data.settings.saluteText);
  };

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
    const rec = sql.prepare('INSERT INTO records (item_id, date, m) VALUES (?, ?, ?)');
    for (const [itemId, byDate] of Object.entries(data.records)) {
      const m = byDate[K]?.m;
      if (m != null) rec.run(itemId, K, m);
    }
  };

  /** The same 30-day rule as pruneChecklist(), as SQL deletes plus pruneTasks(); then the stock. */
  const prune = () => {
    const minDate = daysAgo(CHECKLIST_DAYS);
    run('DELETE FROM checks WHERE date < ?', minDate);
    run('DELETE FROM notes WHERE date < ?', minDate);
    pruneStockRows();
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

  /** create / rename / delete for the { id, name } lists; `onDelete` drops dependent rows. */
  const namedRepo = <T extends Group | Location | TaskGroup>(
    table: NamedTable,
    onDelete: (id: string) => void,
  ): NamedRepo<T> => ({
    async create(name) {
      return write(() => {
        const row = { id: randomUUID(), name };
        run(`INSERT INTO ${table} (id, name, pos) VALUES (?, ?, ?)`, row.id, name, nextPos(table));
        return row as T;
      });
    },
    async rename(id, name) {
      return write(() =>
        run(`UPDATE ${table} SET name = ? WHERE id = ?`, name, id).changes
          ? ({ id, name } as T)
          : null,
      );
    },
    async delete(id) {
      return write(() => {
        if (!run(`DELETE FROM ${table} WHERE id = ?`, id).changes) return false;
        onDelete(id);
        return true;
      });
    },
  });

  const hasItem = (id: string) => !!get('SELECT 1 FROM items WHERE id = ?', id);
  const readItem = (id: string): Item | null => {
    const row = get<NamedRow>('SELECT id, name FROM items WHERE id = ?', id);
    if (!row) return null;
    const multipliers = Object.fromEntries(
      all<MultiplierRow>('SELECT * FROM multipliers WHERE item_id = ? ORDER BY rowid', id).map(
        (m) => [m.group_id, m.qty],
      ),
    );
    return { ...row, multipliers };
  };

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

    items: {
      async create(name) {
        return write(() => {
          const item: Item = { id: randomUUID(), name, multipliers: {} };
          run(
            'INSERT INTO items (id, name, pos) VALUES (?, ?, ?)',
            item.id,
            name,
            nextPos('items'),
          );
          return item;
        });
      },
      async delete(id) {
        return write(() => {
          if (!run('DELETE FROM items WHERE id = ?', id).changes) return false;
          for (const t of ['multipliers', 'records', 'counts']) {
            run(`DELETE FROM ${t} WHERE item_id = ?`, id);
          }
          return true;
        });
      },
      async update(id, patch) {
        return write(() => {
          if (!hasItem(id)) return null;
          if (patch.name !== undefined)
            run('UPDATE items SET name = ? WHERE id = ?', patch.name, id);
          for (const [groupId, qty] of Object.entries(patch.multipliers ?? {})) {
            if (qty) {
              run(
                `INSERT INTO multipliers (item_id, group_id, qty) VALUES (?, ?, ?)
                 ON CONFLICT (item_id, group_id) DO UPDATE SET qty = excluded.qty`,
                id,
                groupId,
                qty,
              );
            } else run('DELETE FROM multipliers WHERE item_id = ? AND group_id = ?', id, groupId);
          }
          return readItem(id);
        });
      },
    },

    groups: namedRepo<Group>('groups', (id) => {
      run('DELETE FROM departures WHERE group_id = ?', id);
      run('DELETE FROM multipliers WHERE group_id = ?', id);
    }),

    locations: namedRepo<Location>('locations', () => {}),

    records: {
      async patch(itemId, date, patch) {
        return write(() => {
          if (!hasItem(itemId)) return null;
          const old = get<RecordRow>(
            'SELECT * FROM records WHERE item_id = ? AND date = ?',
            itemId,
            date,
          );
          const next: DayRecord | null = cleanRecord({ ...(old && cleanRecord(old)), ...patch });
          if (next) {
            run(
              `INSERT INTO records (item_id, date, c, i, m, mc) VALUES (@item_id, @date, @c, @i, @m, @mc)
               ON CONFLICT (item_id, date) DO UPDATE SET c = @c, i = @i, m = @m, mc = @mc`,
              {
                item_id: itemId,
                date,
                c: next.c ?? null,
                i: next.i ?? null,
                m: next.m ?? null,
                mc: next.mc ?? null,
              },
            );
          } else run('DELETE FROM records WHERE item_id = ? AND date = ?', itemId, date);
          return next ?? {};
        });
      },
    },

    departures: {
      async set(groupId, date, d) {
        return write(() => {
          if (!get('SELECT 1 FROM groups WHERE id = ?', groupId)) return false;
          if (d) {
            run(
              `INSERT INTO departures (group_id, date, d) VALUES (?, ?, ?)
               ON CONFLICT (group_id, date) DO UPDATE SET d = excluded.d`,
              groupId,
              date,
              d,
            );
          } else run('DELETE FROM departures WHERE group_id = ? AND date = ?', groupId, date);
          return true;
        });
      },
    },

    counts: {
      async set(date, locationId, itemId, value) {
        return write(() => {
          if (!hasItem(itemId)) return null;
          if (!get('SELECT 1 FROM locations WHERE id = ?', locationId)) return null;
          if (value === null) {
            run(
              'DELETE FROM counts WHERE date = ? AND location_id = ? AND item_id = ?',
              date,
              locationId,
              itemId,
            );
          } else {
            run(
              `INSERT INTO counts (date, location_id, item_id, value) VALUES (?, ?, ?, ?)
               ON CONFLICT (date, location_id, item_id) DO UPDATE SET value = excluded.value`,
              date,
              locationId,
              itemId,
              value,
            );
          }
          const day: DayCounts = {};
          for (const r of all<CountRow>(
            'SELECT * FROM counts WHERE date = ? ORDER BY rowid',
            date,
          )) {
            (day[r.location_id] ??= {})[r.item_id] = r.value;
          }
          return day;
        });
      },
    },

    tasks: {
      async create(name, description, from, group) {
        return write(() => {
          // Stored explicitly (an unknown or missing group = the default one)
          const listed = groupOf({ group }, readTaskGroups());
          const task = newTask(randomUUID(), name, description, from, listed);
          insertTask(task, nextPos('tasks'));
          return task;
        });
      },
      async update(id, { from, ...patch }) {
        return write(() => {
          const old = readTask(id);
          if (!old) return null;
          const task = editTask(old, from, patch);
          updateTask(task);
          return task;
        });
      },
      async delete(id, from) {
        return write(() => {
          const old = readTask(id);
          if (!old) return false;
          const kept = removeTaskFrom(old, from);
          if (kept) updateTask(kept);
          else run('DELETE FROM tasks WHERE id = ?', id);
          // The task's tick and its lines' ticks (`<id>#<item>`)
          run(
            'DELETE FROM checks WHERE (task_id = ? OR substr(task_id, 1, ?) = ?) AND date >= ?',
            id,
            id.length + 1,
            `${id}#`,
            from,
          );
          return true;
        });
      },
      async reorder(ids, move) {
        return write(() => {
          const rank = new Map(ids.map((id, n) => [id, n]));
          const at = (id: string) => rank.get(id) ?? Infinity;
          const tasks = readTasks().sort((a, b) => at(a.id) - at(b.id)); // stable: unlisted keep order
          const task = move && tasks.find((t) => t.id === move.id);
          if (task && readTaskGroups().some((g) => g.id === move.group)) {
            task.group = move.group;
            updateTask(task);
          }
          const stmt = sql.prepare('UPDATE tasks SET pos = ? WHERE id = ?');
          tasks.forEach((t, pos) => stmt.run(pos, t.id));
          return tasks;
        });
      },
    },

    taskGroups: {
      ...namedRepo<TaskGroup>('task_groups', () => {}),
      async delete(id) {
        return write(() => {
          const data = { ...emptyStockData(), tasks: readTasks(), taskGroups: readTaskGroups() };
          const done = removeTaskGroupIn(data, id);
          if (done !== true) return done;
          writeTaskGroups(data.taskGroups);
          data.tasks.forEach(updateTask);
          return true;
        });
      },
      async reorder(ids) {
        return write(() => {
          const rank = new Map(ids.map((id, n) => [id, n]));
          const at = (id: string) => rank.get(id) ?? Infinity;
          const groups = readTaskGroups().sort((a, b) => at(a.id) - at(b.id));
          writeTaskGroups(groups);
          return groups;
        });
      },
    },

    checklist: {
      async setDone(date, taskId, done, item) {
        return write(() => {
          const task = readTask(taskId);
          if (!task || !isTaskOn(task, date)) return null;
          const key = item ? itemCheckKey(taskId, item) : taskId;
          if (done) {
            run(
              'INSERT OR IGNORE INTO checks (date, task_id, at) VALUES (?, ?, ?)',
              date,
              key,
              new Date().toISOString(),
            );
          } else run('DELETE FROM checks WHERE date = ? AND task_id = ?', date, key);
          return dayChecks(date);
        });
      },
      async setNote(date, text) {
        write(() => {
          if (text.trim()) {
            run(
              'INSERT INTO notes (date, text) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET text = excluded.text',
              date,
              text,
            );
          } else run('DELETE FROM notes WHERE date = ?', date);
        });
      },
    },

    stockCards: {
      async reorder(order) {
        return write(() => {
          const full = stockCardOrder(order);
          writeStockCards(full);
          return full;
        });
      },
    },

    settings: {
      async update(patch) {
        return write(() => {
          if (patch.saluteText !== undefined) writeSetting('saluteText', patch.saluteText.trim());
          return readSettings();
        });
      },
    },

    // Auth rows are outside the dataset, so they skip write() (no backup, no prune).
    auth: {
      async pinHashes() {
        const rows = all<{ role: PinRole; hash: string }>('SELECT role, hash FROM pins');
        return Object.fromEntries(rows.map((r) => [r.role, r.hash]));
      },
      async setPinHash(role, hash) {
        run(
          'INSERT INTO pins (role, hash) VALUES (?, ?) ON CONFLICT (role) DO UPDATE SET hash = excluded.hash',
          role,
          hash,
        );
      },
      async createSession(tokenHash, role, linkId) {
        run(
          'INSERT INTO sessions (token_hash, role, link_id, created_at) VALUES (?, ?, ?, ?)',
          tokenHash,
          role,
          linkId ?? null,
          new Date().toISOString(),
        );
      },
      async sessionRole(tokenHash) {
        return (
          get<{ role: Role }>('SELECT role FROM sessions WHERE token_hash = ?', tokenHash)?.role ??
          null
        );
      },
      async deleteSession(tokenHash) {
        run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      },
      async deleteSessions(role, keep = '') {
        run('DELETE FROM sessions WHERE role = ? AND token_hash != ?', role, keep);
      },
      async qrLink() {
        return (
          get<{ id: string; createdAt: string }>(
            'SELECT id, created_at AS createdAt FROM qr_links ORDER BY created_at DESC LIMIT 1',
          ) ?? null
        );
      },
      async setQrLink(id, tokenHash) {
        const createdAt = new Date().toISOString();
        sql.transaction(() => {
          deleteQrLinks();
          run(
            'INSERT INTO qr_links (id, token_hash, created_at) VALUES (?, ?, ?)',
            id,
            tokenHash,
            createdAt,
          );
        })();
        return { id, createdAt };
      },
      async deleteQrLink() {
        sql.transaction(deleteQrLinks)();
      },
      async qrLinkId(tokenHash) {
        return (
          get<{ id: string }>('SELECT id FROM qr_links WHERE token_hash = ?', tokenHash)?.id ?? null
        );
      },
    },
  };
}
