import { useId } from 'react';
import { Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';

/** An on/off button of the room filter bars: `primary` when on, `outline` when off. */
export const toggleProps = (on: boolean) => ({
  variant: on ? ('primary' as const) : ('outline' as const),
  size: 'sm' as const,
  'aria-pressed': on,
});

/** "Level: All rooms 1 2 3…": one level at a time, or all (null). Used on `/rooms` and `/cleaning`. */
export function LevelFilter({
  levels,
  level,
  onChange,
}: {
  levels: readonly string[];
  level: string | null;
  onChange: (level: string | null) => void;
}) {
  const tx = useI18n().t.rooms.filter;
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2">
      <span id={id} className="text-sm text-fg-muted">
        {tx.level}
      </span>
      <Button {...toggleProps(level === null)} onClick={() => onChange(null)}>
        {tx.all}
      </Button>
      {levels.map((l) => (
        <Button
          key={l}
          {...toggleProps(level === l)}
          className="min-w-9"
          onClick={() => onChange(l)}
        >
          {l}
        </Button>
      ))}
    </div>
  );
}
