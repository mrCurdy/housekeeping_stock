import {
  editTask,
  applyTaskMove,
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
  type RecordPatchInput,
  type SettingsPatchInput,
  type StockCard,
  type StockData,
  type Task,
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
}

interface Deps {
  edit: Edit;
  send: Send;
  /** The current dataset, for mutations that compute the change before making it */
  data: StockData;
}

/** add / rename / remove for a list of named rows kept under `key`. */
function named<T extends { id: string; name: string }>(
  { edit, send }: Deps,
  path: string,
  key: DataKey | DataKey[],
  list: (d: StockData) => T[],
  onRemove: (d: StockData, id: string) => void = () => {},
) {
  return {
    add: async (name: string) => {
      const row = await send(() => api.post<T>(path, { name }));
      if (row) edit(key, (d) => void list(d).push(row));
      return row;
    },
    rename: (id: string, name: string) => {
      edit(key, (d) => {
        const row = list(d).find((r) => r.id === id);
        if (row) row.name = name;
      });
      void send(() => api.patch(`${path}/${id}`, { name }));
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

/** Items, departure groups and count locations. */
function setupMutations(deps: Deps) {
  const { edit, send } = deps;
  const items = named<Item>(
    deps,
    '/items',
    ['items', 'records'],
    (d) => d.items,
    (d, id) => void delete d.records[id],
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
        if (patch.name !== undefined) item.name = patch.name;
        for (const [g, qty] of Object.entries(patch.multipliers ?? {})) {
          if (qty) item.multipliers[g] = qty;
          else delete item.multipliers[g];
        }
      });
      void send(() => api.patch(`/items/${id}`, patch));
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
      const list = taskGroupList(data.taskGroups);
      const [moved] = list.splice(from, 1);
      if (!moved || to < 0 || to > list.length) return;
      list.splice(to, 0, moved);
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
      });
      void send(() => api.patch('/settings', patch));
    },
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
  };
}

/** `createMutations`, rebuilt only when one of its inputs changes. */
export function useMutations({ edit, send, data }: Deps): StockMutations {
  return useMemo(() => createMutations({ edit, send, data }), [edit, send, data]);
}
