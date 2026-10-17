import {
  cloneElement,
  isValidElement,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-fg', className)} {...props} />;
}

export interface FormFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** A single control (Input, Textarea, Select). It receives id / aria-* / invalid automatically. */
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint/error, wired up for accessibility. */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        required,
        invalid: !!error || undefined,
        'aria-describedby': hint || error ? descId : undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </Label>
      )}
      {control}
      {(error || hint) && (
        <p id={descId} className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
