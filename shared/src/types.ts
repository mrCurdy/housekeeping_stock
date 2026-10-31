/**
 * The whole dataset, as stored in data/db.json and returned by GET /api/data.
 * Dates are local-time 'YYYY-MM-DD' strings (see dates.ts), so string comparison sorts them.
 */

export interface Item {
  id: string;
  name: string;
  /** Items used per departure, per group: { [groupId]: qty } */
  multipliers: Record<string, number>;
}

/** A room type whose departures consume items (e.g. DOUBLE, TRIPLE). */
export interface Group {
  id: string;
  name: string;
}

/** A place where stock is counted (e.g. "1 level", "Cleaning room"). */
export interface Location {
  id: string;
  name: string;
}

/** What was entered for one item on one day. Missing / null = nothing entered. */
export interface DayRecord {
  /** Extra consumption, added on top of the automatic (departure) consumption. */
  c?: number | null;
  /** Income: stock received. */
  i?: number | null;
  /** Manual end-of-day stock count; resets the running total for that day. */
  m?: number | null;
  /** Manual consumption; replaces automatic + extra consumption. */
  mc?: number | null;
}

/**
 * A daily checklist task; the same list is shown (unticked) every day. Changes apply from the day
 * they were made on, so past days keep the list as it was (rules in checklist.ts).
 */
export interface Task {
  id: string;
  /** The current wording: from the last `earlier` entry's `until` (or always) onwards. */
  name: string;
  /** Instructions shown when the task is opened. '' = none. */
  description: string;
  /** First day it is on the list. Missing = always (tasks from before this was tracked). */
  added?: string;
  /** First day it is no longer on the list. Missing = still on it. */
  removed?: string;
  /** Older wordings, oldest first. Each applied on the days before its `until`. */
  earlier?: TaskWording[];
  /** The `TaskGroup` it is listed in. Missing or unknown = the default group (`groupOf`). */
  group?: string;
}

/**
 * A part of the day's checklist ("Before 11", "Service"…), shown as its own card. Groups are not
 * tracked per day: a rename or a task moved to another group shows on past days too.
 */
export interface TaskGroup {
  id: string;
  /** '' = unnamed (the default group); the client shows a translated title instead. */
  name: string;
}

/** The group every checklist starts with. */
export const DEFAULT_TASK_GROUP_ID = 'default';

export interface TaskWording {
  name: string;
  description: string;
  /** First day it no longer applied. */
  until: string;
}

/** A task as shown on one day: the wording of that day. */
export interface DayTask {
  id: string;
  name: string;
  description: string;
}

export interface DepartureRecord {
  /** Departures (rooms checked out) for a group on that day. */
  d: number;
}

export interface StockData {
  items: Item[];
  groups: Group[];
  locations: Location[];
  /** { [itemId]: { [date]: DayRecord } } */
  records: Record<string, Record<string, DayRecord>>;
  /** { [groupId]: { [date]: { d } } } */
  groupRecords: Record<string, Record<string, DepartureRecord>>;
  /** { [date]: { [locationId]: { [itemId]: count } } }; missing = not counted */
  counts: Record<string, Record<string, Record<string, number>>>;
  /** Daily checklist tasks, in display order (within their group). */
  tasks: Task[];
  /** The checklist's groups, in display order. Never empty (see `taskGroupList`). */
  taskGroups: TaskGroup[];
  /** { [date]: { [taskId]: ISO time it was ticked } }; missing = not done. Kept CHECKLIST_DAYS. */
  checks: Record<string, Record<string, string>>;
  /** { [date]: end-of-day note for the next shift }. Kept CHECKLIST_DAYS. */
  notes: Record<string, string>;
  /** The Stock page's card order as the admin dragged it. [] = the default (STOCK_CARDS). */
  stockCards: StockCard[];
  /** App-wide preferences the admin sets on the Settings page. Unset = the default. */
  settings: AppSettings;
}

export interface AppSettings {
  /** The word the fireworks spell when a checklist group's last task is ticked. Unset = DEFAULT_SALUTE_TEXT. */
  saluteText?: string;
}

export const DEFAULT_SALUTE_TEXT = 'Tubli!';
/** Longer text would not fit across a phone screen as fireworks. */
export const SALUTE_TEXT_MAX = 12;

/** The cards on the Stock page, in their default order. */
export const STOCK_CARDS = ['departures', 'items', 'overview'] as const;
export type StockCard = (typeof STOCK_CARDS)[number];

/** The saved card order completed with the cards it doesn't list, in their default order. */
export const stockCardOrder = (saved: readonly StockCard[]): StockCard[] => [
  ...new Set([...saved, ...STOCK_CARDS]),
];

/** Checklist ticks and notes older than this many days are deleted by the server. */
export const CHECKLIST_DAYS = 30;

export const emptyStockData = (): StockData => ({
  items: [],
  groups: [],
  locations: [],
  records: {},
  groupRecords: {},
  counts: {},
  tasks: [],
  taskGroups: [{ id: DEFAULT_TASK_GROUP_ID, name: '' }],
  checks: {},
  notes: {},
  stockCards: [],
  settings: {},
});

export type DayChecks = Record<string, string>;

export type DayCounts = Record<string, Record<string, number>>;

export interface ApiErrorBody {
  error: { message: string; code: string; details?: unknown };
}
