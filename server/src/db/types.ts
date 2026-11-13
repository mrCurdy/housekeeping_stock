import type {
  AppSettings,
  Cleaning,
  CleaningInput,
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
  Room,
  RoomCreateInput,
  RoomPatchInput,
  RoomStatus,
  RoomStatusCreateInput,
  RoomStatusPatchInput,
  RoomType,
  RoomUnit,
  RoomUnitGroup,
  StockCard,
  SettingsPatchInput,
  StockData,
  Task,
  TaskGroup,
  TaskPatchInput,
  UnitStatus,
  UnitStatusInput,
  NameLang,
} from '@app/shared';

/**
 * Repository contracts. Routes depend only on these interfaces, so adding a storage driver
 * (SQLite, Postgres, …) never touches the routes: implement `Db` in db/<driver>/ and pick it in db/index.ts.
 * Methods that target a missing item/group/room return null (or false); routes turn that into a 404.
 */

export interface NamedRepo<T> {
  create(name: string): Promise<T>;
  /** `lang`: rename only that language's version (lists with localized names); missing = the base name. */
  rename(id: string, name: string, lang?: NameLang): Promise<T | null>;
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
  create(name: string, description: string, from: string, group?: string): Promise<Task>;
  update(id: string, patch: TaskPatchInput): Promise<Task | null>;
  /** Takes the task off the list from `from` on (dropping its ticks from then on). */
  delete(id: string, from: string): Promise<boolean>;
  /**
   * Puts the listed tasks first, in that order, and `move.id` into group `move.group` (ignored
   * when either is unknown). Returns the whole list.
   */
  reorder(ids: string[], move?: { id: string; group: string }): Promise<Task[]>;
}

/** The checklist's groups. There is always at least one. */
export interface TaskGroupRepo extends Omit<NamedRepo<TaskGroup>, 'delete'> {
  /**
   * Deletes a group; its tasks move to the group above it (or below, for the first one).
   * 'last' (nothing deleted) when it is the only group.
   */
  delete(id: string): Promise<boolean | 'last'>;
  /** Puts the listed groups first, in that order. Returns all groups. */
  reorder(ids: string[]): Promise<TaskGroup[]>;
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
  /** All settings (a missing one = its default). The auth guard reads it once per request. */
  read(): Promise<AppSettings>;
  /** Changes the listed settings ('' resets one to its default); returns all of them. */
  update(patch: SettingsPatchInput): Promise<AppSettings>;
}

/** Room cards. `'duplicate'`: another card already has that number. */
export interface RoomRepo {
  /** null: unknown room type (`type: ''` = none). */
  create(input: RoomCreateInput): Promise<Room | null | 'duplicate'>;
  /** Only the given fields change; `type: ''` and `note: ''` clear them. null: unknown room or type. */
  update(id: string, patch: RoomPatchInput): Promise<Room | null | 'duplicate'>;
  /** Deletes the card with its unit statuses and cleanings. */
  delete(id: string): Promise<boolean>;
  /** Sets a unit's current status (now as `at`). null: unknown room, unit or status. */
  setUnitStatus(roomId: string, unitId: string, input: UnitStatusInput): Promise<UnitStatus | null>;
  /** Records a general cleaning; returns the room's cleanings, newest first. null: unknown room. */
  addCleaning(roomId: string, input: CleaningInput): Promise<Cleaning[] | null>;
}

/** A master list (room units, room types): create / rename / delete / reorder. */
export interface OrderedRepo<T> extends NamedRepo<T> {
  /** Puts the listed ids first, in that order. Returns the whole list. */
  reorder(ids: string[]): Promise<T[]>;
}

/** Room units: each is in a group (`RoomUnitGroupRepo`). */
export interface RoomUnitRepo extends OrderedRepo<RoomUnit> {
  /** In `group`; a missing or unknown one = the first group (created as the default when none). */
  create(name: string, group?: string): Promise<RoomUnit>;
  /**
   * Puts the listed units first, in that order, and `move.id` into group `move.group` (ignored
   * when either is unknown). Returns the whole list.
   */
  reorder(ids: string[], move?: { id: string; group: string }): Promise<RoomUnit[]>;
}

export interface RoomUnitGroupRepo extends Omit<OrderedRepo<RoomUnitGroup>, 'delete'> {
  /** 'notEmpty' (nothing deleted) while units are in it. */
  delete(id: string): Promise<boolean | 'notEmpty'>;
}

/** Unit statuses. Stored only once changed: until then the defaults are used (and get stored). */
export interface RoomStatusRepo {
  create(input: RoomStatusCreateInput): Promise<RoomStatus>;
  update(id: string, patch: RoomStatusPatchInput): Promise<RoomStatus | null>;
  /** Its units go back to the first status. 'last' (nothing deleted) when it is the only one. */
  delete(id: string): Promise<boolean | 'last'>;
  reorder(ids: string[]): Promise<RoomStatus[]>;
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
  taskGroups: TaskGroupRepo;
  /** Ticks and notes older than CHECKLIST_DAYS are deleted (on start and with every change). */
  checklist: ChecklistRepo;
  stockCards: StockCardRepo;
  settings: SettingsRepo;
  rooms: RoomRepo;
  /** Removing a unit removes its status on every card. */
  roomUnits: RoomUnitRepo;
  /** A group with units isn't deleted. */
  roomUnitGroups: RoomUnitGroupRepo;
  /** Removing a type clears it on its cards. */
  roomTypes: OrderedRepo<RoomType>;
  roomStatuses: RoomStatusRepo;
  auth: AuthRepo;
  /** Create tables / files. Must be idempotent. */
  init(): Promise<void>;
  close(): Promise<void>;
}
