import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from './I18nContext';

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastApi {
  toast(t: Omit<Toast, 'id'> & { duration?: number }): void;
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  info(title: string, description?: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const toneClass: Record<Tone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: messages } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastApi['toast']>(
    ({ duration = 4000, ...t }) => {
      const id = ++nextId.current;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'danger', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex animate-slide-up gap-3 rounded-lg border border-border bg-surface p-3 shadow-pop"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-fg-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="focus-ring h-5 w-5 shrink-0 cursor-pointer rounded text-fg-muted hover:text-fg"
                aria-label={messages.common.dismiss}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
