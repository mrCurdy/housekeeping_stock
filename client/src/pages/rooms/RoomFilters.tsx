import { EyeOff, Grid3x3, Rows2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { LevelFilter, toggleProps } from './LevelFilter';
import type { RoomSort } from './roomView';
import type { RoomMode, StoredRoomView } from './useRoomView';

const MODES = [
  { mode: 'full', icon: Rows2 },
  { mode: 'compact', icon: Grid3x3 },
] as const satisfies readonly { mode: RoomMode; icon: unknown }[];

const SORTS = ['attention'] as const satisfies readonly RoomSort[];

/**
 * The bar above the room cards: one level at a time (or All), the attention sort toggle
 * (pressing it again goes back to level order), hide-green (only with units) and the
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

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <LevelFilter levels={levels} level={view.level} onChange={(level) => onChange({ level })} />

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
            {...toggleProps(view.sort === sort)}
            onClick={() => onChange({ sort: view.sort === sort ? 'number' : sort })}
          >
            {tx[sort]}
          </Button>
        ))}
      </div>

      {showHideGreen && (
        <Button
          {...toggleProps(view.hideGreen)}
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
              {...toggleProps(view.mode === mode)}
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
