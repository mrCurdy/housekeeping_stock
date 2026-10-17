import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/**
 * Built on native <dialog>: focus trapping, Esc-to-close and top-layer stacking come for free.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px] open:animate-slide-up',
        widths[size],
      )}
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="flex flex-col gap-1">
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {description && <p className="text-sm text-fg-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t.common.close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
