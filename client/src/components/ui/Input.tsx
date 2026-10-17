import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared look for text-like controls (Input, Textarea, Select). */
export const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-muted/70 transition-colors focus-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/40';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
  leftIcon?: ReactNode;
}

export function Input({ className, invalid, leftIcon, ...props }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(fieldClass, 'h-10', leftIcon && 'pl-9', className)}
      {...props}
    />
  );
  if (!leftIcon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted [&>svg]:h-4 [&>svg]:w-4">
        {leftIcon}
      </span>
      {input}
    </div>
  );
}
