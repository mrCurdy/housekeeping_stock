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
}

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
  /** Daily checklist tasks, in display order. */
  tasks: Task[];
  /** { [date]: { [taskId]: ISO time it was ticked } }; missing = not done. Kept CHECKLIST_DAYS. */
  checks: Record<string, Record<string, string>>;
  /** { [date]: end-of-day note for the next shift }. Kept CHECKLIST_DAYS. */
  notes: Record<string, string>;
}

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
  checks: {},
  notes: {},
});

export type DayChecks = Record<string, string>;

export type DayCounts = Record<string, Record<string, number>>;

export interface ApiErrorBody {
  error: { message: string; code: string; details?: unknown };
}
