import {
  editTask,
  formatDate,
  removeRoomIn,
  createdName,
  renameIn,
  removeStatusIn,
  removeTypeIn,
  removeUnitIn,
  removeUnitGroupIn,
  roomStatusList,
  applyUnitMove,
  moveUnitTo,
  unitGroupList,
  applyTaskMove,
  isDefaultRolePermissions,
  itemCheckKey,
  moveTaskTo,
  removeTaskGroupIn,
  removeTaskIn,
  taskGroupList,
  type DayChecks,
  type DayCounts,
  type DayRecord,
  type Group,
  type Item,
  type ItemPatchInput,
  type Location,
  type Localized,
  type NameLang,
  type RecordPatchInput,
  type Room,
  type RoomColor,
  type RoomCreateInput,
  type RoomPatchInput,
  type RoomStatus,
  type RoomStatusPatchInput,
  type RoomType,
  type RoomUnit,
  type RoomUnitGroup,
  type UnitStatusInput,
  type SettingsPatchInput,
  type StockCard,
  type StockData,
  type Task,
  type Cleaning,
  type UnitStatus,
  type TaskGroup,
  type TaskPatchInput,
} from '@app/shared';
import { useMemo } from 'react';
import { api } from '@/lib/api';

/** A top-level part of the dataset an edit may change. */
export type DataKey = keyof StockData;

/**
 * The dataset after `fn` changed it. Only the `keys` it names are copied (deeply); every other
 * part is shared with `prev`, so an edit costs as much as the part it touches.
 */
export function editData(
  prev: StockData,
  keys: DataKey | DataKey[],
  fn: (d: StockData) => void,
): StockData {
  const next = { ...prev };
  const copy = next as Record<DataKey, unknown>;
  for (const k of [keys].flat()) copy[k] = structuredClone(prev[k]);
  fn(next);
  return next;
}

/** Changes the on-screen dataset at once; `fn` may change only the parts `keys` names. */
export type Edit = (keys: DataKey | DataKey[], fn: (d: StockData) => void) => void;

/** Runs a request while counting it as pending; on failure shows a toast and reloads. */
export type Send = <T>(
  request: () => Promise<T>,
  options?: { rethrow?: boolean },
) => Promise<T | undefined>;

export interface StockMutations {
  addItem(name: string): Promise<Item | undefined>;
  updateItem(id: string, patch: ItemPatchInput): void;
  removeItem(id: string): void;
  addGroup(name: string): Promise<Group | undefined>;
  renameGroup(id: string, name: string): void;
  removeGroup(id: string): void;
  addLocation(name: string): Promise<Location | undefined>;
  renameLocation(id: string, name: string): void;
  removeLocation(id: string): void;

  patchRecord(itemId: string, date: string, patch: RecordPatchInput): void;
  setDepartures(groupId: string, date: string, d: number | null): void;
  /** Saves one room count. Throws on failure (the counting page shows its own error). */
  setCount(date: string, locationId: string, itemId: string, value: number | null): Promise<void>;
  /** Task changes apply from `from` onwards; the days before keep the list as it was. */
  addTask(
    name: string,
    description: string,
    from: string,
    group?: string,
  ): Promise<Task | undefined>;
  updateTask(id: string, patch: TaskPatchInput): void;
  removeTask(id: string, from: string): void;
  /** Moves a task into `group` (maybe its own), at place `to` among that group's tasks of `date`. */
  moveTask(id: string, group: string, to: number, date: string): void;
  /** The checklist's groups (cards). Deleting one moves its tasks to the group above. */
  addTaskGroup(name: string): Promise<TaskGroup | undefined>;
  renameTaskGroup(id: string, name: string): void;
  removeTaskGroup(id: string): void;
  moveTaskGroup(from: number, to: number): void;
  /** Ticks a task, or one checklist line of its instructions (`item`, its key). */
  setDone(date: string, taskId: string, done: boolean, item?: string): void;
  setNote(date: string, text: string): void;
  /** Saves the Stock page's card order (the same for everyone). */
  setStockCards(order: StockCard[]): void;
  /** Changes app-wide settings ('' resets one to its default). */
  updateSettings(patch: SettingsPatchInput): void;

  /** Room cards. `type: ''` / `note: ''` clear them. */
  addRoom(input: RoomCreateInput): Promise<Room | undefined>;
  updateRoom(id: string, patch: RoomPatchInput): void;
  removeRoom(id: string): void;
  setUnitStatus(roomId: string, unitId: string, input: UnitStatusInput): void;
  /**
   * Records a general cleaning on `date` (default: the real local today, not the selected day).
   * An earlier day goes behind later cleanings, so it never replaces the latest one.
   */
  markCleaned(roomId: string, by: string, date?: string): void;
  /**
   * The rooms' master setup: units (in groups), types and statuses (each list but the units
   * reorders by `from` → `to`).
   */
  addRoomUnit(name: string, group: string): Promise<RoomUnit | undefined>;
  renameRoomUnit(id: string, name: string): void;
  removeRoomUnit(id: string): void;
  /** Puts unit `id` into `group` at place `to` among that group's units (`moveUnitTo`). */
  moveRoomUnit(id: string, group: string, to: number): void;
  addRoomUnitGroup(name: string): Promise<RoomUnitGroup | undefined>;
  renameRoomUnitGroup(id: string, name: string): void;
  /** False (nothing changes) while the group still has units. */
  removeRoomUnitGroup(id: string): boolean;
  moveRoomUnitGroup(from: number, to: number): void;
  addRoomType(name: string): Promise<RoomType | undefined>;
  renameRoomType(id: string, name: string): void;
  removeRoomType(id: string): void;
  moveRoomType(from: number, to: number): void;
  addRoomStatus(name: string, color: RoomColor): Promise<RoomStatus | undefined>;
  updateRoomStatus(id: string, patch: RoomStatusPatchInput): void;
  /** Its units go back to the first status. The last status is never removed. */
  removeRoomStatus(id: string): void;
  moveRoomStatus(from: number, to: number): void;
}

interface Deps {
  edit: Edit;
  send: Send;
  /** The UI language: renaming an item, room unit, type or status changes only its version. */
  lang?: NameLang;
  /** The current dataset, for mutations that compute the change before making it */
  data: StockData;
}

/** Renames `row` in place in `lang` (`renameIn`: only that language's version changes). */
function renameRow(row: Localized, name: string, lang?: NameLang) {
  const next = renameIn(row, name, lang);
  row.name = next.name;
  if (next.names) row.names = next.names;
  else delete row.names;
}

/**
 * add / rename / remove for a list of named rows kept under `key`. `localized`: the rows have
 * per-language names, so a rename sends and changes only the current language's version, and a
 * new row is also stored in the current language (`createdName`, so it isn't marked untranslated).
 */
function named<T extends { id: string; name: string }>(
  { edit, send, lang }: Deps,
  path: string,
  key: DataKey | DataKey[],
  list: (d: StockData) => T[],
  onRemove: (d: StockData, id: string) => void = () => {},
  localized = false,
) {
  return {
    add: async (name: string) => {
      const body = localized && lang ? { name, lang } : { name };
      const sent = await send(() => api.post<T>(path, body));
      const row = sent && (localized ? { ...sent, ...createdName(sent.name, lang) } : sent);
      if (row) edit(key, (d) => void list(d).push(row));
      return row;
    },
    rename: (id: string, name: string) => {
      edit(key, (d) => {
        const row = list(d).find((r) => r.id === id);
        if (!row) return;
        if (localized) renameRow(row, name, lang);
        else row.name = name;
      });
      void send(() => api.patch(`${path}/${id}`, localized && lang ? { name, lang } : { name }));
    },
    remove: (id: string) => {
      edit(key, (d) => {
        const rows = list(d);
        rows.splice(
          rows.findIndex((r) => r.id === id),
          1,
        );
        onRemove(d, id);
      });
      void send(() => api.delete(`${path}/${id}`));
    },
  };
}

/** `list` with the row at `from` moved to `to`, or null when either is out of range. */
function moved<T>(list: readonly T[], from: number, to: number): T[] | null {
  const next = [...list];
  const [row] = next.splice(from, 1);
  if (row === undefined || to < 0 || to > next.length) return null;
  next.splice(to, 0, row);
  return next;
}

/** Items, departure groups and count locations. */
function setupMutations(deps: Deps) {
  const { edit, send, lang } = deps;
  const items = named<Item>(
    deps,
    '/items',
    ['items', 'records'],
    (d) => d.items,
    (d, id) => void delete d.records[id],
    true,
  );
  const groups = named<Group>(
    deps,
    '/groups',
    ['groups', 'groupRecords', 'items'],
    (d) => d.groups,
    (d, id) => {
      delete d.groupRecords[id];
      d.items.forEach((i) => delete i.multipliers[id]);
    },
  );
  const locations = named<Location>(deps, '/locations', 'locations', (d) => d.locations);
  return {
    addItem: items.add,
    removeItem: items.remove,
    updateItem: (id: string, patch: ItemPatchInput) => {
      edit('items', (d) => {
        const item = d.items.find((i) => i.id === id);
        if (!item) return;
        if (patch.name !== undefined) renameRow(item, patch.name, lang);
        for (const [g, qty] of Object.entries(patch.multipliers ?? {})) {
          if (qty) item.multipliers[g] = qty;
          else delete item.multipliers[g];
        }
      });
      const body = patch.name !== undefined && lang ? { ...patch, lang } : patch;
      void send(() => api.patch(`/items/${id}`, body));
    },
    addGroup: groups.add,
    renameGroup: groups.rename,
    removeGroup: groups.remove,
    addLocation: locations.add,
    renameLocation: locations.rename,
    removeLocation: locations.remove,
  };
}

/** The daily figures: records, departures and room counts. */
function dailyMutations({ edit, send }: Deps) {
  return {
    patchRecord: (itemId: string, date: string, patch: RecordPatchInput) => {
      edit('records', (d) => {
        const byDate = (d.records[itemId] ??= {});
        const next: DayRecord = { ...byDate[date] };
        for (const [k, v] of Object.entries(patch) as [keyof DayRecord, number | null][]) {
          if (v == null) delete next[k];
          else next[k] = v;
        }
        if (Object.keys(next).length) byDate[date] = next;
        else delete byDate[date];
      });
      void send(() => api.patch(`/records/${itemId}/${date}`, patch));
    },
    setDepartures: (groupId: string, date: string, dep: number | null) => {
      edit('groupRecords', (d) => {
        const byDate = (d.groupRecords[groupId] ??= {});
        if (dep) byDate[date] = { d: dep };
        else delete byDate[date];
      });
      void send(() => api.put(`/departures/${groupId}/${date}`, { d: dep }));
    },
    setCount: async (date: string, locationId: string, itemId: string, count: number | null) => {
      const day = await send(
        () => api.put<DayCounts>(`/counts/${date}/${locationId}/${itemId}`, { value: count }),
        { rethrow: true },
      );
      // The response includes what other people counted meanwhile
      edit('counts', (d) => {
        if (day && Object.keys(day).length) d.counts[date] = day;
        else delete d.counts[date];
      });
    },
  };
}

/** The checklist: tasks, their groups, ticks and notes. */
function checklistMutations(deps: Deps) {
  const { edit, send, data } = deps;
  // Old data (and tests) may have no groups yet: start from the default one
  const taskGroups = named<TaskGroup>(
    deps,
    '/task-groups',
    'taskGroups',
    (d) => (d.taskGroups = taskGroupList(d.taskGroups)),
  );
  return {
    addTask: async (name: string, description: string, from: string, group?: string) => {
      const task = await send(() => api.post<Task>('/tasks', { name, description, from, group }));
      if (task) edit('tasks', (d) => void d.tasks.push(task));
      return task;
    },
    updateTask: (id: string, { from, ...patch }: TaskPatchInput) => {
      edit('tasks', (d) => {
        d.tasks = d.tasks.map((t) => (t.id === id ? editTask(t, from, patch) : t));
      });
      void send(() => api.patch(`/tasks/${id}`, { from, ...patch }));
    },
    removeTask: (id: string, from: string) => {
      edit(['tasks', 'checks'], (d) => void removeTaskIn(d, id, from));
      void send(() => api.delete(`/tasks/${id}/${from}`));
    },
    moveTask: (id: string, group: string, to: number, date: string) => {
      const move = moveTaskTo(data.tasks, data.taskGroups, id, group, to, date);
      if (!move) return;
      edit('tasks', (d) => applyTaskMove(d, id, move));
      void send(() => api.put('/tasks/order', { ids: move.ids, move: { id, group } }));
    },
    addTaskGroup: taskGroups.add,
    renameTaskGroup: taskGroups.rename,
    removeTaskGroup: (id: string) => {
      edit(['tasks', 'taskGroups'], (d) => void removeTaskGroupIn(d, id));
      void send(() => api.delete(`/task-groups/${id}`));
    },
    moveTaskGroup: (from: number, to: number) => {
      const list = moved(taskGroupList(data.taskGroups), from, to);
      if (!list) return;
      edit('taskGroups', (d) => void (d.taskGroups = list));
      void send(() => api.put('/task-groups/order', { ids: list.map((g) => g.id) }));
    },
    setDone: (date: string, taskId: string, done: boolean, item?: string) => {
      const key = item ? itemCheckKey(taskId, item) : taskId;
      edit('checks', (d) => {
        const day = (d.checks[date] ??= {});
        if (done) day[key] = new Date().toISOString();
        else delete day[key];
      });
      void send(async () => {
        // The response includes what others ticked meanwhile, with the server's times
        const day = await api.put<DayChecks>(`/checks/${date}/${taskId}`, { done, item });
        edit('checks', (d) => void (d.checks[date] = day));
      });
    },
    setNote: (date: string, text: string) => {
      edit('notes', (d) => {
        if (text.trim()) d.notes[date] = text;
        else delete d.notes[date];
      });
      void send(() => api.put(`/notes/${date}`, { text }));
    },
  };
}

/** App-wide preferences: the Stock page's card order and the Settings page. */
function settingsMutations({ edit, send }: Deps) {
  return {
    setStockCards: (order: StockCard[]) => {
      edit('stockCards', (d) => void (d.stockCards = order));
      void send(() => api.put('/stock-cards/order', { order }));
    },
    updateSettings: (patch: SettingsPatchInput) => {
      edit('settings', (d) => {
        const saluteText = patch.saluteText?.trim();
        if (saluteText) d.settings.saluteText = saluteText;
        else if (patch.saluteText !== undefined) delete d.settings.saluteText;
        if (patch.cleanGreenDays !== undefined) d.settings.cleanGreenDays = patch.cleanGreenDays;
        if (patch.cleanYellowDays !== undefined) d.settings.cleanYellowDays = patch.cleanYellowDays;
        const perms = patch.rolePermissions;
        if (perms && !isDefaultRolePermissions(perms)) d.settings.rolePermissions = perms;
        else if (perms) delete d.settings.rolePermissions;
      });
      void send(() => api.patch('/settings', patch));
    },
  };
}

/** Room cards: their number/type/note, unit statuses and general cleanings. */
function roomMutations({ edit, send }: Deps) {
  return {
    addRoom: async (input: RoomCreateInput) => {
      const room = await send(() => api.post<Room>('/rooms', input));
      if (room) edit('rooms', (d) => void d.rooms.push(room));
      return room;
    },
    updateRoom: (id: string, patch: RoomPatchInput) => {
      edit('rooms', (d) => {
        const room = d.rooms.find((r) => r.id === id);
        if (!room) return;
        if (patch.number !== undefined) room.number = patch.number.trim();
        if (patch.type) room.type = patch.type;
        else if (patch.type !== undefined) delete room.type;
        const note = patch.note?.trim();
        if (note) room.note = note;
        else if (patch.note !== undefined) delete room.note;
      });
      void send(() => api.patch(`/rooms/${id}`, patch));
    },
    removeRoom: (id: string) => {
      edit(['rooms', 'unitStatus', 'cleanings'], (d) => removeRoomIn(d, id));
      void send(() => api.delete(`/rooms/${id}`));
    },
    setUnitStatus: (roomId: string, unitId: string, { status, by, note }: UnitStatusInput) => {
      const text = note?.trim();
      const entry = {
        status,
        by: by.trim(),
        at: new Date().toISOString(),
        ...(text && { note: text }),
      };
      edit('unitStatus', (d) => void ((d.unitStatus[roomId] ??= {})[unitId] = entry));
      void send(async () => {
        // The server's entry carries its own time
        const saved = await api.put<UnitStatus>(`/rooms/${roomId}/units/${unitId}`, {
          status,
          by,
          note,
        });
        edit('unitStatus', (d) => void ((d.unitStatus[roomId] ??= {})[unitId] = saved));
      });
    },
    markCleaned: (roomId: string, by: string, date = formatDate(new Date())) => {
      const cleaning = { date, by: by.trim() };
      edit('cleanings', (d) => {
        // Newest first, as the server keeps them (a same-day one goes first)
        const list = (d.cleanings[roomId] ??= []);
        const at = list.findIndex((c) => c.date <= date);
        list.splice(at < 0 ? list.length : at, 0, cleaning);
      });
      void send(async () => {
        // The server answers with the room's whole list (others may have cleaned meanwhile)
        const list = await api.post<Cleaning[]>(`/rooms/${roomId}/cleanings`, cleaning);
        edit('cleanings', (d) => void (d.cleanings[roomId] = list));
      });
    },
  };
}

/** The rooms' master setup (Settings): units, room types and statuses. */
function roomSetupMutations(deps: Deps) {
  const { edit, send, data, lang } = deps;
  const units = named<RoomUnit>(
    deps,
    '/room-units',
    ['roomUnits', 'unitStatus'],
    (d) => d.roomUnits,
    (d, id) => removeUnitIn(d, id),
    true,
  );
  // Old data may have units without a group: their implied default group gets stored first
  const groups = named<RoomUnitGroup>(
    deps,
    '/room-unit-groups',
    'roomUnitGroups',
    (d) => (d.roomUnitGroups = unitGroupList(d)),
    () => {},
    true,
  );
  const types = named<RoomType>(
    deps,
    '/room-types',
    ['roomTypes', 'rooms'],
    (d) => d.roomTypes,
    (d, id) => removeTypeIn(d, id),
    true,
  );
  /** Moves a row of a master list and sends the new order. */
  const move =
    <K extends 'roomTypes' | 'roomStatuses'>(key: K, path: string, list: () => StockData[K]) =>
    (from: number, to: number) => {
      const next = moved<StockData[K][number]>(list(), from, to);
      if (!next) return;
      edit(key, (d) => void (d[key] = next as StockData[K]));
      void send(() => api.put(`${path}/order`, { ids: next.map((r) => r.id) }));
    };
  return {
    addRoomUnit: async (name: string, group: string) => {
      const body = lang ? { name, group, lang } : { name, group };
      const sent = await send(() => api.post<RoomUnit>('/room-units', body));
      const unit = sent && { ...sent, ...createdName(sent.name, lang) };
      if (unit) {
        edit(['roomUnits', 'roomUnitGroups'], (d) => {
          d.roomUnitGroups = unitGroupList(d);
          d.roomUnits.push(unit);
        });
      }
      return unit;
    },
    renameRoomUnit: units.rename,
    removeRoomUnit: units.remove,
    moveRoomUnit: (id: string, group: string, to: number) => {
      const next = moveUnitTo(data, id, group, to);
      if (!next) return;
      edit(['roomUnits', 'roomUnitGroups'], (d) => applyUnitMove(d, id, next));
      void send(() => api.put('/room-units/order', { ids: next.ids, move: { id, group } }));
    },
    addRoomUnitGroup: groups.add,
    renameRoomUnitGroup: groups.rename,
    removeRoomUnitGroup: (id: string) => {
      const probe = { roomUnits: data.roomUnits, roomUnitGroups: data.roomUnitGroups };
      if (removeUnitGroupIn(probe, id) !== true) return false;
      edit('roomUnitGroups', (d) => void removeUnitGroupIn(d, id));
      void send(() => api.delete(`/room-unit-groups/${id}`));
      return true;
    },
    moveRoomUnitGroup: (from: number, to: number) => {
      const list = moved(unitGroupList(data), from, to);
      if (!list) return;
      edit('roomUnitGroups', (d) => void (d.roomUnitGroups = list));
      void send(() => api.put('/room-unit-groups/order', { ids: list.map((g) => g.id) }));
    },
    addRoomType: types.add,
    renameRoomType: types.rename,
    removeRoomType: types.remove,
    moveRoomType: move('roomTypes', '/room-types', () => data.roomTypes),
    // While none is stored the defaults show; any status change stores the whole list
    addRoomStatus: async (name: string, color: RoomColor) => {
      const body = lang ? { name, color, lang } : { name, color };
      const sent = await send(() => api.post<RoomStatus>('/room-statuses', body));
      const status = sent && { ...sent, ...createdName(sent.name, lang) };
      if (status) {
        edit('roomStatuses', (d) => void (d.roomStatuses = [...roomStatusList(d), status]));
      }
      return status;
    },
    updateRoomStatus: (id: string, patch: RoomStatusPatchInput) => {
      edit('roomStatuses', (d) => {
        d.roomStatuses = roomStatusList(d).map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...(patch.color && { color: patch.color }) };
          if (patch.name !== undefined) renameRow(next, patch.name, lang);
          return next;
        });
      });
      const body = patch.name !== undefined && lang ? { ...patch, lang } : patch;
      void send(() => api.patch(`/room-statuses/${id}`, body));
    },
    removeRoomStatus: (id: string) => {
      // The last one stays (the server would answer 409)
      const list = roomStatusList(data);
      if (list.length <= 1 || !list.some((s) => s.id === id)) return;
      edit(['roomStatuses', 'unitStatus'], (d) => void removeStatusIn(d, id));
      void send(() => api.delete(`/room-statuses/${id}`));
    },
    moveRoomStatus: move('roomStatuses', '/room-statuses', () => roomStatusList(data)),
  };
}

/**
 * Every change to the dataset, grouped by area. Each one updates the screen at once (`edit`, which
 * copies only the parts it names) and sends one small request (`send`).
 */
export function createMutations(deps: Deps): StockMutations {
  return {
    ...setupMutations(deps),
    ...dailyMutations(deps),
    ...checklistMutations(deps),
    ...settingsMutations(deps),
    ...roomMutations(deps),
    ...roomSetupMutations(deps),
  };
}

/** `createMutations`, rebuilt only when one of its inputs changes. */
export function useMutations({ edit, send, data, lang }: Deps): StockMutations {
  return useMemo(() => createMutations({ edit, send, data, lang }), [edit, send, data, lang]);
}
