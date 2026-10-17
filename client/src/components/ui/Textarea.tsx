import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { fieldClass } from './Input';

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(fieldClass, 'min-h-24 py-2 leading-relaxed', className)}
      {...props}
    />
  );
}
