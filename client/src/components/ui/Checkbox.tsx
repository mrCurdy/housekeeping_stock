import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Checkbox({
  label,
  className,
  id,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label?: ReactNode }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className="focus-ring h-4 w-4 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed"
        {...props}
      />
      {label}
    </label>
  );
}
