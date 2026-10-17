import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DateProvider } from '@/context/DateContext';
import { I18nProvider } from '@/context/I18nContext';
import { StockProvider } from '@/context/StockContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import NotFound from '@/pages/NotFound';

/** Code-split a page: it is downloaded the first time its route is visited. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

/**
 * Route table. To add a page: create it in src/pages, add a route here, and add it to NAV in AppShell.
 */
const router = createBrowserRouter([
  {
    element: <AppShell />,
    // Shown while a lazy page loads on a hard refresh / direct link.
    HydrateFallback: () => (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <Spinner />
      </div>
    ),
    children: [
      { index: true, element: <Navigate to="/stock" replace /> },
      { path: 'stock', lazy: page(() => import('@/pages/Stock')) },
      // /counter = all rooms; /counter/<roomId> = one room's counting list (bookmark it per floor)
      { path: 'counter/:locationId?', lazy: page(() => import('@/pages/Counter')) },
      { path: 'checklist', lazy: page(() => import('@/pages/Checklist')) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <DateProvider>
                <StockProvider>
                  <RouterProvider router={router} />
                </StockProvider>
              </DateProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
