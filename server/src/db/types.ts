import type {
  AppSettings,
  DayChecks,
  DayCounts,
  DayRecord,
  Group,
  Item,
  ItemPatchInput,
  Location,
  PinRole,
  RecordPatchInput,
  Role,
  StockCard,
  SettingsPatchInput,
  StockData,
  Task,
  TaskPatchInput,
} from '@app/shared';

/**
 * Repository contracts. Routes depend only on these interfaces, so adding a storage driver
 * (SQLite, Postgres, …) never touches the routes: implement `Db` in db/<driver>/ and pick it in db/index.ts.
 * Methods that target a missing item/group/room return null (or false); routes turn that into a 404.
 */

export interface NamedRepo<T> {
  create(name: string): Promise<T>;
  rename(id: string, name: string): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface ItemRepo extends Omit<NamedRepo<Item>, 'rename'> {
  update(id: string, patch: ItemPatchInput): Promise<Item | null>;
}

export interface RecordRepo {
  /** Merges the given fields into an item's day record; null clears a field. Returns the record. */
  patch(itemId: string, date: string, patch: RecordPatchInput): Promise<DayRecord | null>;
}

export interface DepartureRepo {
  /** null or 0 clears it. Returns false when the group doesn't exist. */
  set(groupId: string, date: string, departures: number | null): Promise<boolean>;
}

export interface CountRepo {
  /** Stores one room count (null = not counted) and returns all counts of that day. */
  set(
    date: string,
    locationId: string,
    itemId: string,
    value: number | null,
  ): Promise<DayCounts | null>;
}

export interface TaskRepo {
  /** Changes apply from the day `from` onwards; earlier days keep the list as it was. */
  create(name: string, description: string, from: string): Promise<Task>;
  update(id: string, patch: TaskPatchInput): Promise<Task | null>;
  /** Takes the task off the list from `from` on (dropping its ticks from then on). */
  delete(id: string, from: string): Promise<boolean>;
  /** Puts the listed tasks first, in that order. Returns the whole list. */
  reorder(ids: string[]): Promise<Task[]>;
}

export interface ChecklistRepo {
  /**
   * Ticks (stores the current time) or unticks a task, or one checklist line of its instructions
   * (`item`); returns that day's ticks.
   */
  setDone(date: string, taskId: string, done: boolean, item?: string): Promise<DayChecks | null>;
  /** '' (or only spaces) clears the note. */
  setNote(date: string, text: string): Promise<void>;
}

export interface StockCardRepo {
  /** Saves the Stock page's card order (unlisted cards follow in the default order); returns it. */
  reorder(order: StockCard[]): Promise<StockCard[]>;
}

export interface SettingsRepo {
  /** Changes the listed settings ('' resets one to its default); returns all of them. */
  update(patch: SettingsPatchInput): Promise<AppSettings>;
}

/** Login storage. Not part of StockData: backups and restores never touch it. */
export interface AuthRepo {
  /** Stored PIN hashes by role (a role without a PIN is missing). */
  pinHashes(): Promise<Partial<Record<PinRole, string>>>;
  setPinHash(role: PinRole, hash: string): Promise<void>;
  /** `linkId`: the QR link a counter session was opened from (revoking it ends the session). */
  createSession(tokenHash: string, role: Role, linkId?: string): Promise<void>;
  /** The role of a session, or null when it doesn't exist (any more). */
  sessionRole(tokenHash: string): Promise<Role | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Logs out every session of a role, except `keep` (a token hash). */
  deleteSessions(role: Role, keep?: string): Promise<void>;
  /** The QR link (there is at most one), or null. */
  qrLink(): Promise<{ id: string; createdAt: string } | null>;
  /** Replaces the QR link: the old one and its sessions are deleted. */
  setQrLink(id: string, tokenHash: string): Promise<{ id: string; createdAt: string }>;
  /** Deletes the QR link and its sessions. */
  deleteQrLink(): Promise<void>;
  /** The id of the QR link with this token hash, or null. */
  qrLinkId(tokenHash: string): Promise<string | null>;
}

export type DbDriver = 'sqlite';

export interface Db {
  driver: DbDriver;
  /** The whole dataset (the client computes stock from it). */
  snapshot(): Promise<StockData>;
  /** Replaces everything (backup restore). */
  replace(data: StockData): Promise<void>;
  items: ItemRepo;
  groups: NamedRepo<Group>;
  /** Removing a room keeps its counts: they still count in the stock totals. */
  locations: NamedRepo<Location>;
  records: RecordRepo;
  departures: DepartureRepo;
  counts: CountRepo;
  tasks: TaskRepo;
  /** Ticks and notes older than CHECKLIST_DAYS are deleted (on start and with every change). */
  checklist: ChecklistRepo;
  stockCards: StockCardRepo;
  settings: SettingsRepo;
  auth: AuthRepo;
  /** Create tables / files. Must be idempotent. */
  init(): Promise<void>;
  close(): Promise<void>;
}
