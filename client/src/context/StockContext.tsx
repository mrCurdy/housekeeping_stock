import {
  createStockMath,
  emptyStockData,
  type BackupInput,
  type StockData,
  type StockMath,
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
import { PermissionsContext } from './PermissionsContext';
import { useToast } from './ToastContext';
import {
  editData,
  useMutations,
  type Edit,
  type Send,
  type StockMutations,
} from './stock/mutations';

/**
 * The dataset and every change to it.
 *
 * The server is the source of truth. Each change updates the screen right away (optimistic) and
 * sends one small request for just that value, so several people can work at the same time.
 * If a request fails, an error toast is shown and the data is reloaded from the server.
 * Every 15 s and when the window regains focus the data is refreshed, so changes made on other
 * devices show up; that is skipped while a request is pending or an input has focus.
 */
interface StockApi extends StockMutations {
  data: StockData;
  loading: boolean;
  /** Set when the first load failed */
  loadError: string | null;
  math: StockMath;
  reload(): Promise<void>;
  /** Replaces everything with a backup file's contents. Throws on failure. */
  restore(backup: BackupInput): Promise<void>;
}

const StockContext = createContext<StockApi | null>(null);

/** How often the data is refreshed from the server */
export const POLL_MS = 15_000;

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

  const edit = useCallback<Edit>((keys, fn) => {
    setData((prev) => editData(prev, keys, fn));
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
  const send = useCallback<Send>(
    async (request, { rethrow = false } = {}) => {
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

  const mutations = useMutations({ edit, send, data });

  const value = useMemo<StockApi>(
    () => ({
      data,
      loading,
      loadError,
      math: createStockMath(data, { minDateStr: minDate }),
      reload,
      ...mutations,
      restore: async (backup) => {
        const restored = await send(() => api.post<StockData>('/restore', backup), {
          rethrow: true,
        });
        if (restored) setData(restored);
      },
    }),
    [data, loading, loadError, minDate, reload, send, mutations],
  );

  const rolePermissions = data.settings.rolePermissions;
  const permissions = useMemo(
    () => ({ rolePermissions, ready: !loading }),
    [rolePermissions, loading],
  );

  return (
    <StockContext value={value}>
      <PermissionsContext value={permissions}>{children}</PermissionsContext>
    </StockContext>
  );
}

export function useStock() {
  const ctx = use(StockContext);
  if (!ctx) throw new Error('useStock must be used inside <StockProvider>');
  return ctx;
}
