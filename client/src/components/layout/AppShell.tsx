import { todayOnly, type Permission } from '@app/shared';
import {
  Boxes,
  Broom,
  ClipboardList,
  DoorOpen,
  ListChecks,
  LogOut,
  Menu,
  Package,
  Settings,
  X,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import type { Messages } from '@/i18n/en';
import { cn } from '@/lib/cn';
import { LanguageSwitcher } from './LanguageSwitcher';
import { PaletteToggle } from './PaletteToggle';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: (t: Messages) => string;
  icon: ComponentType<{ className?: string }>;
  /** Shown only to roles with this permission; the others are redirected to their home page. */
  perm?: Permission;
  /** A role lands here (on `/`, or from a page it can't open) only with this permission (default: `perm`). */
  home?: Permission;
}

/** Add pages to the sidebar here (and their route in App.tsx). */
const NAV: NavItem[] = [
  // open to every role, but read-only without `daily`, so only the admin lands here
  { to: '/stock', label: (t) => t.nav.stock, icon: Package, home: 'daily' },
  { to: '/counter', label: (t) => t.nav.counter, icon: ClipboardList, perm: 'count' },
  { to: '/checklist', label: (t) => t.nav.checklist, icon: ListChecks, perm: 'checklist' },
  { to: '/rooms', label: (t) => t.nav.rooms, icon: DoorOpen, perm: 'setup' },
  { to: '/cleaning', label: (t) => t.nav.cleaning, icon: Broom, perm: 'cleaning' },
  { to: '/settings', label: (t) => t.nav.settings, icon: Settings, perm: 'pins' },
];

type Can = (perm: Permission) => boolean;

/** The page a role starts on: the first NAV entry it may land on (admin /stock, housekeeper /counter, reception /checklist). */
const homePath = (can: Can) =>
  NAV.find((n) => {
    const perm = n.home ?? n.perm;
    return !perm || can(perm);
  })?.to ?? '/stock';

/** The index route: sends `/` to the role's home page. */
export function HomeRedirect() {
  const { can } = useAuth();
  return <Navigate to={homePath(can)} replace />;
}

export function AppShell() {
  const { t } = useI18n();
  const { role, can, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // Counter mode (QR session): only the Counter, with no menu or toolbar
  const counterOnly = todayOnly(role);
  if (counterOnly && !pathname.startsWith('/counter')) return <Navigate to="/counter" replace />;
  // A page this role can't use → its home page
  const page = NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  if (page?.perm && !can(page.perm)) return <Navigate to={homePath(can)} replace />;

  const sidebar = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.filter((n) => !n.perm || can(n.perm)).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary-soft text-primary'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )
          }
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{label(t)}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full overflow-x-clip">
      {/* Desktop sidebar */}
      {!counterOnly && (
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <Brand />
          {sidebar}
        </aside>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 animate-slide-up border-r border-border bg-surface">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.nav.closeMenu}
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
          {!counterOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t.nav.openMenu}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <span className={cn('font-semibold', !counterOnly && 'md:hidden')}>{t.appName}</span>
          <div className="flex-1" />
          <LanguageSwitcher />
          <PaletteToggle />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            title={t.nav.logout}
            aria-label={t.nav.logout}
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <NavLink
      to="/stock"
      className="flex h-14 items-center gap-2 border-b border-border px-5 font-semibold"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-fg">
        <Boxes className="h-4 w-4" />
      </span>
      {t.appName}
    </NavLink>
  );
}
