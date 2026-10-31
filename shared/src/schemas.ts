import { z } from 'zod';
import { pruneTasks, taskGroupList } from './checklist';
import {
  emptyStockData,
  SALUTE_TEXT_MAX,
  STOCK_CARDS,
  type AppSettings,
  type DayRecord,
  type StockCard,
  type StockData,
  type Task,
  type TaskGroup,
} from './types';

/** Request bodies. The server validates with these (validateBody); the client can reuse them. */

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const name = z.string().trim().max(100);
/** A quantity: 0 or more. null clears the value. */
const qty = z.number().finite().min(0);
const nullableQty = qty.nullable();

export const nameSchema = z.object({ name });
export type NameInput = z.infer<typeof nameSchema>;

export const itemPatchSchema = z.object({
  name: name.optional(),
  /** Only the groups given are changed; null removes the group from the item. */
  multipliers: z.record(z.string(), nullableQty).optional(),
});
export type ItemPatchInput = z.infer<typeof itemPatchSchema>;

export const recordPatchSchema = z.object({
  c: z.number().finite().nullable().optional(),
  i: z.number().finite().nullable().optional(),
  m: z.number().finite().nullable().optional(),
  mc: z.number().finite().nullable().optional(),
});
export type RecordPatchInput = z.infer<typeof recordPatchSchema>;

export const departuresSchema = z.object({ d: nullableQty });
export type DeparturesInput = z.infer<typeof departuresSchema>;

export const countSchema = z.object({ value: nullableQty });
export type CountInput = z.infer<typeof countSchema>;

const description = z.string().max(5000);

/** `from`: the day the change applies from (earlier days keep the list as it was). */
export const taskCreateSchema = z.object({
  name,
  description: description.default(''),
  from: dateSchema,
  /** The group to list it in (missing = the first group). */
  group: z.string().optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskPatchSchema = z.object({
  name: name.optional(),
  description: description.optional(),
  from: dateSchema,
});
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;

/**
 * The task ids in their new order (ids not listed keep their place at the end). `move` also puts
 * one task into another group (a drag across group cards).
 */
export const taskOrderSchema = z.object({
  ids: z.array(z.string()),
  move: z.object({ id: z.string(), group: z.string() }).optional(),
});
export type TaskOrderInput = z.infer<typeof taskOrderSchema>;

/** The checklist group ids in their new order (ids not listed keep their place at the end). */
export const taskGroupOrderSchema = z.object({ ids: z.array(z.string()) });
export type TaskGroupOrderInput = z.infer<typeof taskGroupOrderSchema>;

/** The Stock page's cards in their new order (cards not listed follow in the default order). */
export const stockCardOrderSchema = z.object({ order: z.array(z.enum(STOCK_CARDS)) });
export type StockCardOrderInput = z.infer<typeof stockCardOrderSchema>;

/** A partial update of the app settings. '' (or only spaces) resets a value to its default. */
export const settingsPatchSchema = z.object({
  saluteText: z.string().trim().max(SALUTE_TEXT_MAX).optional(),
});
export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;

/** `item`: tick one checklist line of the task's instructions instead of the task. */
export const checkSchema = z.object({
  done: z.boolean(),
  item: z
    .string()
    .regex(/^[a-z0-9]{1,16}$/)
    .optional(),
});
export type CheckInput = z.infer<typeof checkSchema>;

/** '' clears the note. */
export const noteSchema = z.object({ text: z.string().max(5000) });
export type NoteInput = z.infer<typeof noteSchema>;

// ---- Backups ----

/** Old backups stored blank inputs as '' (and numbers as strings): read those as "not entered". */
const looseNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
  z.number().finite().nullable(),
);

const idName = z.object({ id: z.string().min(1), name: z.string().catch('') });

/** A backup file (also the format of data/db.json). Unknown fields are dropped, blanks pruned. */
export const backupSchema = z
  .object({
    items: z.array(
      idName.extend({ multipliers: z.record(z.string(), looseNumber).catch({}).default({}) }),
    ),
    groups: z.array(idName).default([]),
    locations: z.array(idName).default([]),
    records: z
      .record(
        z.string(),
        z.record(
          z.string(),
          z.object({ c: looseNumber, i: looseNumber, m: looseNumber, mc: looseNumber }).partial(),
        ),
      )
      .default({}),
    groupRecords: z
      .record(z.string(), z.record(z.string(), z.object({ d: looseNumber }).partial()))
      .default({}),
    counts: z
      .record(z.string(), z.record(z.string(), z.record(z.string(), looseNumber)))
      .default({}),
    tasks: z
      .array(
        idName.extend({
          description: z.string().catch('').default(''),
          added: dateSchema.optional().catch(undefined),
          removed: dateSchema.optional().catch(undefined),
          earlier: z
            .array(
              z.object({
                name: z.string().catch(''),
                description: z.string().catch(''),
                until: dateSchema,
              }),
            )
            .optional()
            .catch(undefined),
          group: z.string().optional().catch(undefined),
        }),
      )
      .default([]),
    taskGroups: z.array(idName).catch([]).default([]),
    checks: z.record(z.string(), z.record(z.string(), z.string())).default({}),
    notes: z.record(z.string(), z.string()).default({}),
    stockCards: z.array(z.enum(STOCK_CARDS)).catch([]).default([]),
    settings: z
      .object({ saluteText: z.string().max(SALUTE_TEXT_MAX).optional().catch(undefined) })
      .catch({})
      .default({}),
  })
  .transform(normalizeStockData);

export type BackupInput = z.input<typeof backupSchema>;

type Loose<T> = { [K in keyof T]?: T[K] | null };

/** Drops empty values and records, so stored data only contains what was really entered. */
export function normalizeStockData(raw: {
  items: { id: string; name: string; multipliers: Record<string, number | null> }[];
  groups: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  records: Record<string, Record<string, Loose<DayRecord>>>;
  groupRecords: Record<string, Record<string, { d?: number | null }>>;
  counts: Record<string, Record<string, Record<string, number | null>>>;
  tasks?: Task[];
  taskGroups?: TaskGroup[];
  checks?: Record<string, Record<string, string>>;
  notes?: Record<string, string>;
  stockCards?: StockCard[];
  settings?: AppSettings;
}): StockData {
  const out = emptyStockData();
  out.items = raw.items.map((i) => ({
    id: i.id,
    name: i.name,
    multipliers: Object.fromEntries(
      Object.entries(i.multipliers).filter((e): e is [string, number] => e[1] != null && e[1] > 0),
    ),
  }));
  out.groups = raw.groups.map(({ id, name }) => ({ id, name }));
  out.locations = raw.locations.map(({ id, name }) => ({ id, name }));

  for (const [itemId, byDate] of Object.entries(raw.records)) {
    for (const [date, rec] of Object.entries(byDate)) {
      const clean = cleanRecord(rec);
      if (clean) (out.records[itemId] ??= {})[date] = clean;
    }
  }
  for (const [groupId, byDate] of Object.entries(raw.groupRecords)) {
    for (const [date, rec] of Object.entries(byDate)) {
      if (rec.d != null && rec.d !== 0) (out.groupRecords[groupId] ??= {})[date] = { d: rec.d };
    }
  }
  for (const [date, byLocation] of Object.entries(raw.counts)) {
    for (const [locationId, byItem] of Object.entries(byLocation)) {
      for (const [itemId, value] of Object.entries(byItem)) {
        if (value != null) ((out.counts[date] ??= {})[locationId] ??= {})[itemId] = value;
      }
    }
  }
  // At least one group; a task's group is kept only when it exists
  out.taskGroups = taskGroupList(raw.taskGroups?.map(({ id, name }) => ({ id, name })));
  const groupIds = new Set(out.taskGroups.map((g) => g.id));
  out.tasks = (raw.tasks ?? []).map(
    ({ id, name, description, added, removed, earlier, group }) => ({
      id,
      name,
      description,
      ...(added && { added }),
      ...(removed && { removed }),
      ...(earlier?.length && {
        earlier: earlier.map((w) => ({ name: w.name, description: w.description, until: w.until })),
      }),
      ...(group && groupIds.has(group) && { group }),
    }),
  );
  for (const [date, byTask] of Object.entries(raw.checks ?? {})) {
    if (Object.keys(byTask).length) out.checks[date] = { ...byTask };
  }
  for (const [date, text] of Object.entries(raw.notes ?? {})) {
    if (text.trim()) out.notes[date] = text;
  }
  out.stockCards = [...new Set(raw.stockCards ?? [])];
  const saluteText = raw.settings?.saluteText?.trim();
  if (saluteText) out.settings.saluteText = saluteText;
  return out;
}

/**
 * Deletes checklist ticks and notes dated before `minDate`, and task history no page shows any more.
 * Returns true if anything was removed.
 */
export function pruneChecklist(data: StockData, minDate: string): boolean {
  let changed = pruneTasks(data, minDate);
  for (const byDate of [data.checks, data.notes]) {
    for (const date of Object.keys(byDate)) {
      if (date < minDate) {
        delete byDate[date];
        changed = true;
      }
    }
  }
  return changed;
}

/** The record without null fields, or null when nothing is left. */
export function cleanRecord(rec: Loose<DayRecord>): DayRecord | null {
  const out: DayRecord = {};
  for (const key of ['c', 'i', 'm', 'mc'] as const) {
    const v = rec[key];
    if (v != null) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}
