import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * CSS-only tooltip shown on hover and keyboard focus.
 * `align="end"` lines it up with the right edge of the trigger (for triggers at the edge of the screen).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'center' | 'end';
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 rounded-md bg-fg px-2 py-1 text-xs whitespace-nowrap text-bg opacity-0 transition-opacity group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0',
        )}
      >
        {content}
      </span>
    </span>
  );
}
