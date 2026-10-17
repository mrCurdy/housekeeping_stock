import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui';

interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** Red confirm button (default true) */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** `if (await confirm({ title: 'Remove?' })) …`: a promise-based <ConfirmDialog>. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <ConfirmDialog
        open={options !== null}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={options?.title}
        description={options?.description}
        confirmLabel={options?.confirmLabel}
        danger={options?.danger}
      />
    </ConfirmContext>
  );
}

export function useConfirm() {
  const ctx = use(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
