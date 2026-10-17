import { Boxes, ClipboardList, ListChecks, Menu, Package, X } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import type { Messages } from '@/i18n/en';
import { cn } from '@/lib/cn';
import { DataMenu } from './DataMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: (t: Messages) => string;
  icon: ComponentType<{ className?: string }>;
}

/** Add pages to the sidebar here (and their route in App.tsx). */
const NAV: NavItem[] = [
  { to: '/stock', label: (t) => t.nav.stock, icon: Package },
  { to: '/counter', label: (t) => t.nav.counter, icon: ClipboardList },
  { to: '/checklist', label: (t) => t.nav.checklist, icon: ListChecks },
];

export function AppShell() {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Counting and the checklist happen on phones: keep their header free of the admin tools
  const { pathname } = useLocation();
  const counting = pathname.startsWith('/counter') || pathname.startsWith('/checklist');

  const sidebar = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ to, label, icon: Icon }) => (
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
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Brand />
        {sidebar}
      </aside>

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
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t.nav.openMenu}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold md:hidden">{t.appName}</span>
          <div className="flex-1" />
          <div className={cn(counting && 'hidden md:block')}>
            <DataMenu />
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
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
