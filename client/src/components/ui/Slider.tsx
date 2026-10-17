import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SliderProps {
  label?: ReactNode;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Formats the value shown next to the label. */
  format?: (value: number) => ReactNode;
  /** Custom track background, e.g. a hue gradient. */
  trackStyle?: CSSProperties;
  disabled?: boolean;
  className?: string;
}

/** Native range input with label and live value, styled with theme tokens. */
export function Slider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  format,
  trackStyle,
  disabled,
  className,
}: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn('flex flex-col gap-2', disabled && 'opacity-60', className)}>
      {label && (
        <div className="flex items-center justify-between text-sm">
          <label htmlFor={id} className="font-medium">
            {label}
          </label>
          <span className="font-mono text-xs text-fg-muted tabular-nums">
            {format ? format(value) : value}
          </span>
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="slider focus-ring h-2 w-full cursor-pointer appearance-none rounded-full"
        style={
          trackStyle ?? {
            background: `linear-gradient(to right, var(--primary) ${pct}%, var(--border) ${pct}%)`,
          }
        }
      />
    </div>
  );
}
