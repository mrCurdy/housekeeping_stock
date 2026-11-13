import { z } from 'zod';
import { isDefaultRolePermissions, rolePermissionsSchema, STAFF_ROLES } from './auth';
import { pruneTasks, taskGroupList } from './checklist';
import { cleanNames, NAME_LANGS, type LocalizedNames, type NameLang } from './names';
import { roomStatusList, unitGroupList, unitGroupOf } from './rooms';
import {
  emptyStockData,
  ROOM_COLORS,
  ROOM_NOTE_MAX,
  SALUTE_TEXT_MAX,
  STOCK_CARDS,
  type AppSettings,
  type Cleaning,
  type DayRecord,
  type Room,
  type RoomStatus,
  type StockCard,
  type StockData,
  type Task,
  type TaskGroup,
  type UnitStatus,
} from './types';

/** Request bodies. The server validates with these (validateBody); the client can reuse them. */

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const name = z.string().trim().max(100);
/** A quantity: 0 or more. null clears the value. */
const qty = z.number().finite().min(0);
const nullableQty = qty.nullable();

export const nameSchema = z.object({ name });
/** The UI language a rename is for: only that language's version changes. Missing = the base name. */
const lang = z.enum(NAME_LANGS).optional();
export type NameInput = z.infer<typeof nameSchema>;

export const itemPatchSchema = z.object({
  name: name.optional(),
  lang,
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

const days = z.number().int().min(0).max(3650);

/**
 * A partial update of the app settings. '' (or only spaces) resets a text to its default. The
 * cleaning thresholds must keep 0 <= green < yellow; when only one is sent, the server checks the
 * pair against the stored other one (`cleanThresholds`).
 */
export const settingsPatchSchema = z
  .object({
    saluteText: z.string().trim().max(SALUTE_TEXT_MAX).optional(),
    cleanGreenDays: days.optional(),
    cleanYellowDays: days.optional(),
    /** The whole matrix for both staff roles (the defaults = reset). */
    rolePermissions: rolePermissionsSchema.optional(),
  })
  .refine(
    (s) =>
      s.cleanGreenDays === undefined ||
      s.cleanYellowDays === undefined ||
      s.cleanGreenDays < s.cleanYellowDays,
    { message: 'Green days must be less than yellow days', path: ['cleanGreenDays'] },
  );
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

// ---- Rooms ----

const roomNumber = z.string().trim().min(1).max(20);
/** The room note; '' clears it. */
const roomNote = z.string().trim().max(ROOM_NOTE_MAX);
/** A person's name in the "who" dialog. */
const who = z.string().trim().min(1).max(100);

/** `type`: a room type id ('' or missing = none). */
export const roomCreateSchema = z.object({
  number: roomNumber,
  type: z.string().max(100).optional(),
  note: roomNote.optional(),
});
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;

/** Only the fields given change; `type: ''` and `note: ''` clear them. */
export const roomPatchSchema = z.object({
  number: roomNumber.optional(),
  type: z.string().max(100).optional(),
  note: roomNote.optional(),
});
export type RoomPatchInput = z.infer<typeof roomPatchSchema>;

/** Room types and units: create and rename use `nameSchema`-like bodies with a non-blank name. */
export const roomNameSchema = z.object({ name: name.pipe(z.string().min(1)), lang });
export type RoomNameInput = z.infer<typeof roomNameSchema>;

export const roomStatusCreateSchema = z.object({
  name: name.pipe(z.string().min(1)),
  color: z.enum(ROOM_COLORS),
});
export type RoomStatusCreateInput = z.infer<typeof roomStatusCreateSchema>;

export const roomStatusPatchSchema = roomStatusCreateSchema.partial().extend({ lang });
export type RoomStatusPatchInput = z.infer<typeof roomStatusPatchSchema>;

/** A new room unit, in `group` (missing or unknown: the first group, see `roomUnits.create`). */
export const roomUnitCreateSchema = roomNameSchema.extend({ group: z.string().min(1).optional() });
export type RoomUnitCreateInput = z.infer<typeof roomUnitCreateSchema>;

/**
 * The unit ids in their new order (ids not listed keep their place at the end); `move` also puts
 * that unit into another group (`moveUnitTo`).
 */
export const unitOrderSchema = z.object({
  ids: z.array(z.string()),
  move: z.object({ id: z.string(), group: z.string() }).optional(),
});
export type UnitOrderInput = z.infer<typeof unitOrderSchema>;

/** Units, statuses or room types in their new order (ids not listed keep their place at the end). */
export const idOrderSchema = z.object({ ids: z.array(z.string()) });
export type IdOrderInput = z.infer<typeof idOrderSchema>;

/** A unit's new status, who set it and an optional note. */
export const unitStatusSchema = z.object({
  status: z.string().min(1).max(100),
  by: who,
  note: roomNote.optional(),
});
export type UnitStatusInput = z.infer<typeof unitStatusSchema>;

/** A general cleaning: the local day (`formatDate`) and the cleaner's name. */
export const cleaningSchema = z.object({ date: dateSchema, by: who });
export type CleaningInput = z.infer<typeof cleaningSchema>;

// ---- Backups ----

/** Old backups stored blank inputs as '' (and numbers as strings): read those as "not entered". */
const looseNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
  z.number().finite().nullable(),
);

const idName = z.object({ id: z.string().min(1), name: z.string().catch('') });
/** Per-language name versions (added later: older backups don't have them). */
const nameVersion = z.string().optional().catch(undefined);
const names = z
  .object({ en: nameVersion, et: nameVersion, ru: nameVersion } satisfies Record<NameLang, unknown>)
  .optional()
  .catch(undefined);
const localized = idName.extend({ names });

/** A backup file (also the format of data/db.json). Unknown fields are dropped, blanks pruned. */
export const backupSchema = z
  .object({
    items: z.array(
      localized.extend({ multipliers: z.record(z.string(), looseNumber).catch({}).default({}) }),
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
      .object({
        saluteText: z.string().max(SALUTE_TEXT_MAX).optional().catch(undefined),
        cleanGreenDays: days.optional().catch(undefined),
        cleanYellowDays: days.optional().catch(undefined),
        rolePermissions: rolePermissionsSchema.optional().catch(undefined),
      })
      .catch({})
      .default({}),
    // Rooms (added later: older backups don't have them)
    rooms: z
      .array(
        z.object({
          id: z.string().min(1),
          number: z.string().catch(''),
          type: z.string().optional().catch(undefined),
          note: z.string().optional().catch(undefined),
        }),
      )
      .catch([])
      .default([]),
    roomTypes: z.array(localized).catch([]).default([]),
    roomUnits: z
      .array(localized.extend({ group: z.string().optional().catch(undefined) }))
      .catch([])
      .default([]),
    roomUnitGroups: z.array(localized).catch([]).default([]),
    roomStatuses: z
      .array(localized.extend({ color: z.enum(ROOM_COLORS).catch('grey') }))
      .catch([])
      .default([]),
    unitStatus: z
      .record(
        z.string(),
        z.record(
          z.string(),
          z.object({
            status: z.string(),
            by: z.string().catch(''),
            at: z.string().catch(''),
            note: z.string().optional().catch(undefined),
          }),
        ),
      )
      .catch({})
      .default({}),
    cleanings: z
      .record(z.string(), z.array(z.object({ date: dateSchema, by: z.string().catch('') })))
      .catch({})
      .default({}),
  })
  .transform(normalizeStockData);

export type BackupInput = z.input<typeof backupSchema>;

type Loose<T> = { [K in keyof T]?: T[K] | null };

/** Drops empty values and records, so stored data only contains what was really entered. */
export function normalizeStockData(raw: {
  items: {
    id: string;
    name: string;
    names?: LocalizedNames;
    multipliers: Record<string, number | null>;
  }[];
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
  rooms?: Room[];
  roomTypes?: { id: string; name: string; names?: LocalizedNames }[];
  roomUnits?: { id: string; name: string; names?: LocalizedNames; group?: string }[];
  roomUnitGroups?: { id: string; name: string; names?: LocalizedNames }[];
  roomStatuses?: RoomStatus[];
  unitStatus?: Record<string, Record<string, UnitStatus>>;
  cleanings?: Record<string, Cleaning[]>;
}): StockData {
  const out = emptyStockData();
  out.items = raw.items.map((i) => ({
    id: i.id,
    name: i.name,
    ...withNames(i),
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
  const { cleanGreenDays: green, cleanYellowDays: yellow } = raw.settings ?? {};
  if (green === undefined || yellow === undefined || green < yellow) {
    if (green !== undefined) out.settings.cleanGreenDays = green;
    if (yellow !== undefined) out.settings.cleanYellowDays = yellow;
  }
  const perms = raw.settings?.rolePermissions;
  if (perms) {
    const parsed = rolePermissionsSchema.safeParse(
      Object.fromEntries(STAFF_ROLES.map((r) => [r, perms[r] ?? []])),
    );
    if (parsed.success && !isDefaultRolePermissions(parsed.data))
      out.settings.rolePermissions = parsed.data;
  }
  normalizeRooms(raw, out);
  return out;
}

/** `{ names }` when the entity has real per-language versions, else nothing. */
const withNames = (e: { name: string; names?: LocalizedNames }) => {
  const n = cleanNames(e.names, e.name);
  return n ? { names: n } : {};
};

/** Rooms: blank notes dropped, references to unknown types/rooms/units/statuses dropped, no empty maps. */
function normalizeRooms(raw: Parameters<typeof normalizeStockData>[0], out: StockData) {
  out.roomTypes = (raw.roomTypes ?? []).map((t) => ({ id: t.id, name: t.name, ...withNames(t) }));
  // Every unit gets a known group: without one (old backups) the default group, created for them
  const groups = (raw.roomUnitGroups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    ...withNames(g),
  }));
  out.roomUnitGroups = unitGroupList({ roomUnits: raw.roomUnits ?? [], roomUnitGroups: groups });
  out.roomUnits = (raw.roomUnits ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    ...withNames(u),
    group: unitGroupOf(u, out.roomUnitGroups),
  }));
  out.roomStatuses = (raw.roomStatuses ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    ...withNames(s),
  }));
  const typeIds = new Set(out.roomTypes.map((t) => t.id));
  out.rooms = (raw.rooms ?? []).map(({ id, number, type, note }) => ({
    id,
    number,
    ...(type && typeIds.has(type) && { type }),
    ...(note?.trim() && { note: note.trim() }),
  }));

  const roomIds = new Set(out.rooms.map((r) => r.id));
  const unitIds = new Set(out.roomUnits.map((u) => u.id));
  const statusIds = new Set(roomStatusList(out).map((s) => s.id));
  for (const [roomId, byUnit] of Object.entries(raw.unitStatus ?? {})) {
    if (!roomIds.has(roomId)) continue;
    for (const [unitId, { status, by, at, note }] of Object.entries(byUnit)) {
      if (!unitIds.has(unitId) || !statusIds.has(status)) continue;
      (out.unitStatus[roomId] ??= {})[unitId] = {
        status,
        by,
        at,
        ...(note?.trim() && { note: note.trim() }),
      };
    }
  }
  for (const [roomId, list] of Object.entries(raw.cleanings ?? {})) {
    if (!roomIds.has(roomId) || !list.length) continue;
    out.cleanings[roomId] = list
      .map(({ date, by }) => ({ date, by }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
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
