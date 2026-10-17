import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  addDays,
  backupSchema,
  CHECKLIST_DAYS,
  cleanRecord,
  emptyStockData,
  formatDate,
  type Group,
  type Item,
  type Location,
  editTask,
  isTaskOn,
  newTask,
  pruneChecklist,
  removeTaskIn,
  type StockData,
  todayLocal,
} from '@app/shared';
import { logger } from '../../lib/logger';
import type { Db, NamedRepo } from '../types';

/**
 * Single-file JSON store (data/db.json, same format as a backup file). The whole dataset lives
 * in memory; every mutation is flushed with an atomic write (tmp file + rename), serialized
 * through a promise chain. Fine for one server process — not for several processes on one file.
 *
 * Before the first change of each day the file is copied to backups/db-YYYY-MM-DD.json
 * (= the data as it was at the start of that day); copies older than `backupDays` are deleted.
 * Checklist ticks and notes older than CHECKLIST_DAYS are dropped on start and with every write.
 */
export function createJsonDb(filePath: string, { backupDays = 30 } = {}): Db {
  let data: StockData = emptyStockData();
  let writeChain: Promise<void> = Promise.resolve();
  const backupDir = join(dirname(filePath), 'backups');
  const backupName = (date: string) => `${basename(filePath, '.json')}-${date}.json`;
  let lastBackup = '';

  const dailyBackup = async () => {
    const today = formatDate(new Date());
    if (!backupDays || lastBackup === today) return;
    await mkdir(backupDir, { recursive: true });
    try {
      await copyFile(filePath, join(backupDir, backupName(today)), constants.COPYFILE_EXCL);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return; // no file yet: nothing to keep
      if (code !== 'EEXIST') throw err; // EEXIST: today's copy was made before a restart
    }
    lastBackup = today;
    const keep = new Set(
      Array.from({ length: backupDays }, (_, n) =>
        backupName(formatDate(new Date(Date.now() - n * 86_400_000))),
      ),
    );
    for (const f of await readdir(backupDir)) {
      if (f.startsWith(basename(filePath, '.json') + '-') && !keep.has(f)) {
        await unlink(join(backupDir, f));
      }
    }
  };

  const prune = () => pruneChecklist(data, formatDate(addDays(todayLocal(), -CHECKLIST_DAYS)));

  const persist = () => {
    prune();
    const snapshot = JSON.stringify(data, null, 2);
    writeChain = writeChain.then(async () => {
      await dailyBackup().catch((err) => logger.warn({ err }, 'Daily backup failed'));
      const tmp = `${filePath}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, filePath);
    });
    return writeChain;
  };

  const clone = <T>(v: T): T => structuredClone(v);

  /** create / rename / delete for the { id, name } lists */
  const namedRepo = <T extends Item | Group | Location>(
    list: () => T[],
    make: (name: string) => T,
    onDelete: (id: string) => void,
  ): NamedRepo<T> => ({
    async create(name) {
      const row = make(name);
      list().push(row);
      await persist();
      return clone(row);
    },
    async rename(id, name) {
      const row = list().find((r) => r.id === id);
      if (!row) return null;
      row.name = name;
      await persist();
      return clone(row);
    },
    async delete(id) {
      const i = list().findIndex((r) => r.id === id);
      if (i < 0) return false;
      list().splice(i, 1);
      onDelete(id);
      await persist();
      return true;
    },
  });

  const items = namedRepo<Item>(
    () => data.items,
    (name) => ({ id: randomUUID(), name, multipliers: {} }),
    (id) => {
      delete data.records[id];
      for (const day of Object.values(data.counts)) {
        for (const room of Object.values(day)) delete room[id];
      }
    },
  );

  return {
    driver: 'json',

    async init() {
      await mkdir(dirname(filePath), { recursive: true });
      let text: string;
      try {
        text = await readFile(filePath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        await persist();
        return;
      }
      // Older files (from the first version of the app) contain blank '' values: normalize them
      const parsed = backupSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error(`${filePath} is not a valid stock data file`);
      data = parsed.data;
      if (prune()) await persist();
    },

    async close() {
      await writeChain;
    },

    async snapshot() {
      return clone(data);
    },

    async replace(next) {
      data = clone(next);
      await persist();
    },

    items: {
      create: items.create,
      delete: items.delete,
      async update(id, patch) {
        const item = data.items.find((i) => i.id === id);
        if (!item) return null;
        if (patch.name !== undefined) item.name = patch.name;
        for (const [groupId, qty] of Object.entries(patch.multipliers ?? {})) {
          if (qty) item.multipliers[groupId] = qty;
          else delete item.multipliers[groupId];
        }
        await persist();
        return clone(item);
      },
    },

    groups: namedRepo<Group>(
      () => data.groups,
      (name) => ({ id: randomUUID(), name }),
      (id) => {
        delete data.groupRecords[id];
        for (const item of data.items) delete item.multipliers[id];
      },
    ),

    locations: namedRepo<Location>(
      () => data.locations,
      (name) => ({ id: randomUUID(), name }),
      () => {},
    ),

    records: {
      async patch(itemId, date, patch) {
        if (!data.items.some((i) => i.id === itemId)) return null;
        const byDate = (data.records[itemId] ??= {});
        const next = cleanRecord({ ...byDate[date], ...patch });
        if (next) byDate[date] = next;
        else delete byDate[date];
        if (!Object.keys(byDate).length) delete data.records[itemId];
        await persist();
        return clone(next ?? {});
      },
    },

    departures: {
      async set(groupId, date, d) {
        if (!data.groups.some((g) => g.id === groupId)) return false;
        const byDate = (data.groupRecords[groupId] ??= {});
        if (d) byDate[date] = { d };
        else delete byDate[date];
        if (!Object.keys(byDate).length) delete data.groupRecords[groupId];
        await persist();
        return true;
      },
    },

    counts: {
      async set(date, locationId, itemId, value) {
        if (!data.items.some((i) => i.id === itemId)) return null;
        if (!data.locations.some((l) => l.id === locationId)) return null;
        if (value === null) {
          const room = data.counts[date]?.[locationId];
          if (room) {
            delete room[itemId];
            if (!Object.keys(room).length) delete data.counts[date]![locationId];
            if (!Object.keys(data.counts[date]!).length) delete data.counts[date];
          }
        } else {
          ((data.counts[date] ??= {})[locationId] ??= {})[itemId] = value;
        }
        await persist();
        return clone(data.counts[date] ?? {});
      },
    },

    tasks: {
      async create(name, description, from) {
        const task = newTask(randomUUID(), name, description, from);
        data.tasks.push(task);
        await persist();
        return clone(task);
      },
      async update(id, { from, ...patch }) {
        const i = data.tasks.findIndex((t) => t.id === id);
        if (i < 0) return null;
        const task = (data.tasks[i] = editTask(data.tasks[i]!, from, patch));
        await persist();
        return clone(task);
      },
      async delete(id, from) {
        if (!removeTaskIn(data, id, from)) return false;
        await persist();
        return true;
      },
      async reorder(ids) {
        const rank = new Map(ids.map((id, n) => [id, n]));
        const at = (id: string) => rank.get(id) ?? Infinity;
        data.tasks.sort((a, b) => at(a.id) - at(b.id)); // stable: unlisted ones keep their order
        await persist();
        return clone(data.tasks);
      },
    },

    checklist: {
      async setDone(date, taskId, done) {
        if (!data.tasks.some((t) => t.id === taskId && isTaskOn(t, date))) return null;
        if (done) (data.checks[date] ??= {})[taskId] ??= new Date().toISOString();
        else if (data.checks[date]) {
          delete data.checks[date][taskId];
          if (!Object.keys(data.checks[date]).length) delete data.checks[date];
        }
        await persist();
        return clone(data.checks[date] ?? {});
      },
      async setNote(date, text) {
        if (text.trim()) data.notes[date] = text;
        else delete data.notes[date];
        await persist();
      },
    },
  };
}
