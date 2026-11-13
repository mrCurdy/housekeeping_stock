import { EyeOff, Grid3x3, Rows2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import type { RoomSort } from './roomView';
import type { RoomMode, StoredRoomView } from './useRoomView';

const MODES = [
  { mode: 'full', icon: Rows2 },
  { mode: 'compact', icon: Grid3x3 },
] as const satisfies readonly { mode: RoomMode; icon: unknown }[];

const SORTS = ['cleanedNew', 'cleanedOld', 'attention'] as const satisfies readonly RoomSort[];

/**
 * The bar above the room cards: one level at a time (or All), one of three sort toggles
 * (pressing the active one goes back to number order), hide-green (only with units) and the
 * full cards / compact tiles switch.
 */
export function RoomFilters({
  levels,
  view,
  onChange,
  showHideGreen,
}: {
  levels: readonly string[];
  view: StoredRoomView;
  onChange: (patch: Partial<StoredRoomView>) => void;
  showHideGreen: boolean;
}) {
  const tx = useI18n().t.rooms.filter;
  const id = useId();
  const toggle = (on: boolean) => ({
    variant: on ? ('primary' as const) : ('outline' as const),
    size: 'sm' as const,
    'aria-pressed': on,
  });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div
        role="group"
        aria-labelledby={`${id}-level`}
        className="flex flex-wrap items-center gap-2"
      >
        <span id={`${id}-level`} className="text-sm text-fg-muted">
          {tx.level}
        </span>
        <Button {...toggle(view.level === null)} onClick={() => onChange({ level: null })}>
          {tx.all}
        </Button>
        {levels.map((level) => (
          <Button
            key={level}
            {...toggle(view.level === level)}
            className="min-w-9"
            onClick={() => onChange({ level })}
          >
            {level}
          </Button>
        ))}
      </div>

      <div
        role="group"
        aria-labelledby={`${id}-sort`}
        className="flex flex-wrap items-center gap-2"
      >
        <span id={`${id}-sort`} className="text-sm text-fg-muted">
          {tx.sort}
        </span>
        {SORTS.map((sort) => (
          <Button
            key={sort}
            {...toggle(view.sort === sort)}
            onClick={() => onChange({ sort: view.sort === sort ? 'number' : sort })}
          >
            {tx[sort]}
          </Button>
        ))}
      </div>

      {showHideGreen && (
        <Button
          {...toggle(view.hideGreen)}
          leftIcon={<EyeOff className="h-4 w-4" />}
          onClick={() => onChange({ hideGreen: !view.hideGreen })}
        >
          {tx.hideGreen}
        </Button>
      )}

      <div
        role="group"
        aria-labelledby={`${id}-mode`}
        className="flex flex-wrap items-center gap-2"
      >
        <span id={`${id}-mode`} className="text-sm text-fg-muted">
          {tx.view}
        </span>
        {MODES.map(({ mode, icon: Icon }) => {
          const label = mode === 'full' ? tx.viewFull : tx.viewCompact;
          return (
            <Button
              key={mode}
              {...toggle(view.mode === mode)}
              size="icon-sm"
              aria-label={label}
              title={label}
              onClick={() => onChange({ mode })}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
