import { can as roleCan, type Permission, type Role } from '@app/shared';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Spinner } from '@/components/ui';
import { ApiError, api, apiErrorMessage, AUTH_EXPIRED } from '@/lib/api';
import Login from '@/pages/Login';
import { useI18n } from './I18nContext';

interface AuthState {
  role: Role;
  /** `can('setup')`: hide what this role may not do (the server enforces it anyway). */
  can(perm: Permission): boolean;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Reads and removes `?key=` (the QR code's token) from the URL, so it isn't bookmarked or shared. */
function takeKey(): string | null {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('key');
  if (key === null) return null;
  url.searchParams.delete('key');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return key;
}

/**
 * Checks the session at startup (exchanging a QR `?key=` first) and shows the PIN screen until
 * there is one. The app inside (data, router) is mounted only after login. Any 401 from the API
 * (`auth:expired`) returns to the PIN screen.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [role, setRole] = useState<Role | null | undefined>(undefined); // undefined = checking
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const key = takeKey();
    (async () => {
      if (key) {
        try {
          await api.post('/auth/link', { token: key });
        } catch (err) {
          if (!cancelled) {
            setNotice(
              err instanceof ApiError && err.status === 401
                ? t.auth.qrInvalid
                : apiErrorMessage(err, t),
            );
          }
        }
      }
      try {
        const me = await api.get<{ role: Role }>('/auth/me');
        if (!cancelled) setRole(me.role);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError && err.status === 401)) setNotice(apiErrorMessage(err, t));
        setRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at startup
  }, []);

  useEffect(() => {
    const expired = () => {
      setNotice(undefined);
      setRole(null);
    };
    window.addEventListener(AUTH_EXPIRED, expired);
    return () => window.removeEventListener(AUTH_EXPIRED, expired);
  }, []);

  const login = useCallback(async (pin: string) => {
    const res = await api.post<{ role: Role }>('/auth/login', { pin });
    setNotice(undefined);
    setRole(res.role);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setRole(null);
    }
  }, []);

  const value = useMemo(
    () => (role ? { role, can: (perm: Permission) => roleCan(role, perm), logout } : null),
    [role, logout],
  );

  if (role === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <Spinner />
      </div>
    );
  }
  if (!value) return <Login onSubmit={login} notice={notice} />;
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
