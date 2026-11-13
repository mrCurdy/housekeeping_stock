import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  type AppSettings,
  cleanRecord,
  type DayChecks,
  emptyStockData,
  type Group,
  type Item,
  type Location,
  type StockCard,
  type StockData,
  type Task,
  type TaskGroup,
  taskGroupList,
} from '@app/shared';
import type { NamedRepo } from '../types';

/* Row shapes as stored (snake_case, missing values as NULL) */
export interface NamedRow {
  id: string;
  name: string;
}
export interface MultiplierRow {
  item_id: string;
  group_id: string;
  qty: number;
}
export interface RecordRow {
  item_id: string;
  date: string;
  c: number | null;
  i: number | null;
  m: number | null;
  mc: number | null;
}
export interface DepartureRow {
  group_id: string;
  date: string;
  d: number;
}
export interface CountRow {
  date: string;
  location_id: string;
  item_id: string;
  value: number;
}
export interface TaskRow {
  id: string;
  name: string;
  description: string;
  added: string | null;
  removed: string | null;
  earlier_json: string | null;
  group_id: string | null;
}

export const toTask = (r: TaskRow): Task => ({
  id: r.id,
  name: r.name,
  description: r.description,
  ...(r.added && { added: r.added }),
  ...(r.removed && { removed: r.removed }),
  ...(r.earlier_json && { earlier: JSON.parse(r.earlier_json) as Task['earlier'] }),
  ...(r.group_id && { group: r.group_id }),
});
export const taskParams = (t: Task) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  added: t.added ?? null,
  removed: t.removed ?? null,
  earlier_json: t.earlier?.length ? JSON.stringify(t.earlier) : null,
  group_id: t.group ?? null,
});

/** Tables holding the dataset (not the auth tables), in the order `replace()` fills them. */
export const DATA_TABLES = [
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
export type NamedTable = 'items' | 'groups' | 'locations' | 'task_groups';

/**
 * What every repo file gets from `index.ts`: the query helpers on the open connection, and
 * `write(fn)` (the daily backup, then `fn` and pruning in one transaction).
 */
export interface Ctx {
  all: <T>(query: string, ...params: unknown[]) => T[];
  get: <T>(query: string, ...params: unknown[]) => T | undefined;
  run: (query: string, ...params: unknown[]) => Database.RunResult;
  prepare: (query: string) => Database.Statement;
  /** Runs `fn` in a transaction outside `write()` (no backup, no prune). */
  transaction: <T>(fn: () => T) => T;
  write: <T>(fn: () => T) => T;
}

/** Shared row helpers: reading and writing the tables several repos (and the backups) touch. */
export function createRows({ all, get, run, prepare }: Omit<Ctx, 'write'>) {
  const nextPos = (table: NamedTable | 'tasks') =>
    get<{ n: number }>(`SELECT COALESCE(MAX(pos) + 1, 0) AS n FROM ${table}`)!.n;

  const readStockCards = () =>
    all<{ id: StockCard }>('SELECT id FROM stock_cards ORDER BY pos').map((r) => r.id);
  const writeStockCards = (order: StockCard[]) => {
    run('DELETE FROM stock_cards');
    const stmt = prepare('INSERT INTO stock_cards (id, pos) VALUES (?, ?)');
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
    const stmt = prepare('INSERT INTO task_groups (id, name, pos) VALUES (?, ?, ?)');
    taskGroupList(groups).forEach((g, pos) => stmt.run(g.id, g.name, pos));
  };
  const dayChecks = (date: string): DayChecks =>
    Object.fromEntries(
      all<{ task_id: string; at: string }>(
        'SELECT task_id, at FROM checks WHERE date = ?',
        date,
      ).map((r) => [r.task_id, r.at]),
    );

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
      const stmt = prepare(`INSERT INTO ${table} (id, name, pos) VALUES (?, ?, ?)`);
      rows.forEach((r, pos) => stmt.run(r.id, r.name, pos));
    };
    named('items', data.items);
    named('groups', data.groups);
    named('locations', data.locations);
    const mult = prepare('INSERT INTO multipliers (item_id, group_id, qty) VALUES (?, ?, ?)');
    for (const item of data.items) {
      for (const [groupId, qty] of Object.entries(item.multipliers))
        mult.run(item.id, groupId, qty);
    }
    const rec = prepare(
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
    const dep = prepare('INSERT INTO departures (group_id, date, d) VALUES (?, ?, ?)');
    for (const [groupId, byDate] of Object.entries(data.groupRecords)) {
      for (const [date, r] of Object.entries(byDate)) dep.run(groupId, date, r.d);
    }
    const count = prepare(
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
    const check = prepare('INSERT INTO checks (date, task_id, at) VALUES (?, ?, ?)');
    for (const [date, byTask] of Object.entries(data.checks)) {
      for (const [taskId, at] of Object.entries(byTask)) check.run(date, taskId, at);
    }
    const note = prepare('INSERT INTO notes (date, text) VALUES (?, ?)');
    for (const [date, text] of Object.entries(data.notes)) note.run(date, text);
    writeStockCards(data.stockCards);
    writeSetting('saluteText', data.settings.saluteText);
  };

  return {
    nextPos,
    readStockCards,
    writeStockCards,
    readSettings,
    writeSetting,
    readTasks,
    readTask,
    insertTask,
    updateTask,
    readTaskGroups,
    writeTaskGroups,
    dayChecks,
    hasItem,
    readItem,
    snapshot,
    fill,
  };
}

/** create / rename / delete for the { id, name } lists; `onDelete` drops dependent rows. */
export const namedRepo = <T extends Group | Location | TaskGroup>(
  ctx: Ctx,
  table: NamedTable,
  onDelete: (id: string) => void,
): NamedRepo<T> => {
  const { run, write } = ctx;
  const { nextPos } = createRows(ctx);
  return {
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
  };
};
