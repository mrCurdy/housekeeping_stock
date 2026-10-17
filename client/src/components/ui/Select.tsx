import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { fieldClass } from './Input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends ComponentProps<'select'> {
  options: SelectOption[];
  invalid?: boolean;
  placeholder?: string;
}

/** Native select (accessible, mobile-friendly) styled to match other fields. */
export function Select({ className, options, invalid, placeholder, ...props }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(fieldClass, 'h-10 appearance-none pr-9')}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-muted" />
    </div>
  );
}
