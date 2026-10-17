import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Composable table primitives. Wrap in <Card> for a bordered look. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: ComponentProps<'thead'>) => (
  <thead className={cn('border-b border-border bg-surface-2/50', className)} {...p} />
);
export const TBody = ({ className, ...p }: ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />
);
export const Tr = ({ className, ...p }: ComponentProps<'tr'>) => (
  <tr
    className={cn('border-b border-border transition-colors hover:bg-surface-2/40', className)}
    {...p}
  />
);
export const Th = ({ className, ...p }: ComponentProps<'th'>) => (
  <th
    className={cn(
      'h-10 px-4 text-left align-middle text-xs font-medium tracking-wide text-fg-muted uppercase',
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: ComponentProps<'td'>) => (
  <td className={cn('px-4 py-3 align-middle', className)} {...p} />
);
