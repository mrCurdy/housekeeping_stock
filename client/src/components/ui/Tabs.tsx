import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Controlled tabs with roving focus (arrow keys) per WAI-ARIA tabs pattern. */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const idx = items.findIndex((i) => i.value === value);
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    const next = items[(idx + delta + items.length) % items.length]!;
    onValueChange(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="inline-flex gap-1 rounded-lg bg-surface-2 p-1"
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${id}-tab-${item.value}`}
              aria-selected={active}
              aria-controls={`${id}-panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              data-value={item.value}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'focus-ring cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${id}-panel-${item.value}`}
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={item.value !== value}
          className="pt-4"
        >
          {item.value === value && item.content}
        </div>
      ))}
    </div>
  );
}
