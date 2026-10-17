import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DropdownItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  /** Render prop for the trigger; spread the given props onto a button. */
  trigger: (props: {
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
  }) => ReactNode;
  items: (DropdownItem | 'separator')[];
  align?: 'start' | 'end';
  header?: ReactNode;
}

export function Dropdown({ trigger, items, align = 'end', header }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 min-w-48 animate-fade-in rounded-md border border-border bg-surface p-1 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {header && <div className="border-b border-border px-3 py-2 mb-1">{header}</div>}
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'focus-ring flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4',
                  item.danger && 'text-danger',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
