import {
  createStockMath,
  editTask,
  emptyStockData,
  applyTaskMove,
  itemCheckKey,
  moveTaskTo,
  removeTaskGroupIn,
  removeTaskIn,
  taskGroupList,
  type BackupInput,
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
  type StockMath,
  type Task,
  type TaskGroup,
  type TaskPatchInput,
} from '@app/shared';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { useSelectedDate } from './DateContext';
import { useI18n } from './I18nContext';
import { useToast } from './ToastContext';

/**
 * The dataset and every change to it.
 *
 * The server is the source of truth. Each change updates the screen right away (optimistic) and
 * sends one small request for just that value, so several people can work at the same time.
 * If a request fails, an error toast is shown and the data is reloaded from the server.
 * Every 15 s and when the window regains focus the data is refreshed, so changes made on other
 * devices show up; that is skipped while a request is pending or an input has focus.
 */
interface StockApi {
  data: StockData;
  loading: boolean;
  /** Set when the first load failed */
  loadError: string | null;
  math: StockMath;
  reload(): Promise<void>;

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

  /** Replaces everything with a backup file's contents. Throws on failure. */
  restore(backup: BackupInput): Promise<void>;
}

const StockContext = createContext<StockApi | null>(null);

const POLL_MS = 15_000;

const isTyping = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
};

export function StockProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { t } = useI18n();
  const { minDate } = useSelectedDate();
  const [data, setData] = useState<StockData>(emptyStockData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Requests on their way to the server */
  const pending = useRef(0);
  /** Bumped by every change, so a refresh that started before it doesn't overwrite it */
  const version = useRef(0);

  const edit = useCallback((fn: (d: StockData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const reload = useCallback(() => {
    const startedAt = version.current;
    return api.get<StockData>('/data').then(
      (fresh) => {
        // Something was changed while the request ran: keep it on screen, the next poll catches up
        if (pending.current === 0 && version.current === startedAt) setData(fresh);
        setLoadError(null);
        setLoading(false);
      },
      (err: unknown) => {
        setLoadError(apiErrorMessage(err, t));
        setLoading(false);
      },
    );
  }, [t]);

  useEffect(() => {
    void reload();
    const refresh = () => {
      if (pending.current === 0 && !isTyping() && !document.hidden) void reload();
    };
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener('focus', refresh);
    // Warn before closing the tab while a change is still on its way to the server
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [reload]);

  /** Runs a request while counting it as pending; on failure shows a toast and reloads. */
  const send = useCallback(
    async <T,>(request: () => Promise<T>, { rethrow = false } = {}): Promise<T | undefined> => {
      let failed = false;
      version.current++;
      pending.current++;
      try {
        return await request();
      } catch (err) {
        if (rethrow) throw err;
        toast.error(t.common.notSaved, apiErrorMessage(err, t));
        failed = true;
        return undefined;
      } finally {
        pending.current--;
        if (failed) void reload();
      }
    },
    [reload, toast, t],
  );

  const value = useMemo<StockApi>(() => {
    const named = <T extends { id: string; name: string }>(
      path: string,
      list: (d: StockData) => T[],
      onRemove: (d: StockData, id: string) => void = () => {},
    ) => ({
      add: async (name: string) => {
        const row = await send(() => api.post<T>(path, { name }));
        if (row) edit((d) => void list(d).push(row));
        return row;
      },
      rename: (id: string, name: string) => {
        edit((d) => {
          const row = list(d).find((r) => r.id === id);
          if (row) row.name = name;
        });
        void send(() => api.patch(`${path}/${id}`, { name }));
      },
      remove: (id: string) => {
        edit((d) => {
          const rows = list(d);
          rows.splice(
            rows.findIndex((r) => r.id === id),
            1,
          );
          onRemove(d, id);
        });
        void send(() => api.delete(`${path}/${id}`));
      },
    });

    const items = named<Item>(
      '/items',
      (d) => d.items,
      (d, id) => void delete d.records[id],
    );
    const groups = named<Group>(
      '/groups',
      (d) => d.groups,
      (d, id) => {
        delete d.groupRecords[id];
        d.items.forEach((i) => delete i.multipliers[id]);
      },
    );
    const locations = named<Location>('/locations', (d) => d.locations);
    // Old data (and tests) may have no groups yet: start from the default one
    const taskGroups = named<TaskGroup>(
      '/task-groups',
      (d) => (d.taskGroups = taskGroupList(d.taskGroups)),
    );

    return {
      data,
      loading,
      loadError,
      math: createStockMath(data, { minDateStr: minDate }),
      reload,

      addItem: items.add,
      removeItem: items.remove,
      updateItem: (id, patch) => {
        edit((d) => {
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

      patchRecord: (itemId, date, patch) => {
        edit((d) => {
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
      setDepartures: (groupId, date, dep) => {
        edit((d) => {
          const byDate = (d.groupRecords[groupId] ??= {});
          if (dep) byDate[date] = { d: dep };
          else delete byDate[date];
        });
        void send(() => api.put(`/departures/${groupId}/${date}`, { d: dep }));
      },
      setCount: async (date, locationId, itemId, count) => {
        const day = await send(
          () => api.put<DayCounts>(`/counts/${date}/${locationId}/${itemId}`, { value: count }),
          { rethrow: true },
        );
        // The response includes what other people counted meanwhile
        edit((d) => {
          if (day && Object.keys(day).length) d.counts[date] = day;
          else delete d.counts[date];
        });
      },

      addTask: async (name, description, from, group) => {
        const task = await send(() => api.post<Task>('/tasks', { name, description, from, group }));
        if (task) edit((d) => void d.tasks.push(task));
        return task;
      },
      updateTask: (id, { from, ...patch }) => {
        edit((d) => {
          d.tasks = d.tasks.map((t) => (t.id === id ? editTask(t, from, patch) : t));
        });
        void send(() => api.patch(`/tasks/${id}`, { from, ...patch }));
      },
      removeTask: (id, from) => {
        edit((d) => void removeTaskIn(d, id, from));
        void send(() => api.delete(`/tasks/${id}/${from}`));
      },
      moveTask: (id, group, to, date) => {
        const move = moveTaskTo(data.tasks, data.taskGroups, id, group, to, date);
        if (!move) return;
        edit((d) => applyTaskMove(d, id, move));
        void send(() => api.put('/tasks/order', { ids: move.ids, move: { id, group } }));
      },
      addTaskGroup: taskGroups.add,
      renameTaskGroup: taskGroups.rename,
      removeTaskGroup: (id) => {
        edit((d) => void removeTaskGroupIn(d, id));
        void send(() => api.delete(`/task-groups/${id}`));
      },
      moveTaskGroup: (from, to) => {
        const list = taskGroupList(data.taskGroups);
        const [moved] = list.splice(from, 1);
        if (!moved || to < 0 || to > list.length) return;
        list.splice(to, 0, moved);
        edit((d) => void (d.taskGroups = list));
        void send(() => api.put('/task-groups/order', { ids: list.map((g) => g.id) }));
      },
      setDone: (date, taskId, done, item) => {
        const key = item ? itemCheckKey(taskId, item) : taskId;
        edit((d) => {
          const day = (d.checks[date] ??= {});
          if (done) day[key] = new Date().toISOString();
          else delete day[key];
        });
        void send(async () => {
          // The response includes what others ticked meanwhile, with the server's times
          const day = await api.put<DayChecks>(`/checks/${date}/${taskId}`, { done, item });
          edit((d) => void (d.checks[date] = day));
        });
      },
      setNote: (date, text) => {
        edit((d) => {
          if (text.trim()) d.notes[date] = text;
          else delete d.notes[date];
        });
        void send(() => api.put(`/notes/${date}`, { text }));
      },
      setStockCards: (order) => {
        edit((d) => void (d.stockCards = order));
        void send(() => api.put('/stock-cards/order', { order }));
      },
      updateSettings: (patch) => {
        edit((d) => {
          const saluteText = patch.saluteText?.trim();
          if (saluteText) d.settings.saluteText = saluteText;
          else if (patch.saluteText !== undefined) delete d.settings.saluteText;
        });
        void send(() => api.patch('/settings', patch));
      },

      restore: async (backup) => {
        const restored = await send(() => api.post<StockData>('/restore', backup), {
          rethrow: true,
        });
        if (restored) setData(restored);
      },
    };
  }, [data, loading, loadError, minDate, reload, send, edit]);

  return <StockContext value={value}>{children}</StockContext>;
}

export function useStock() {
  const ctx = use(StockContext);
  if (!ctx) throw new Error('useStock must be used inside <StockProvider>');
  return ctx;
}
