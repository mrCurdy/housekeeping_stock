import { Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { LevelFilter, toggleProps } from '../rooms/LevelFilter';
import type { CleaningView } from './useCleaningView';

/** The bar above the cleaning tiles: one level at a time (or All) and the "Dirty first" toggle. */
export function CleaningFilters({
  levels,
  view,
  onChange,
}: {
  levels: readonly string[];
  view: CleaningView;
  onChange: (patch: Partial<CleaningView>) => void;
}) {
  const tx = useI18n().t.cleaning;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <LevelFilter levels={levels} level={view.level} onChange={(level) => onChange({ level })} />
      <Button
        {...toggleProps(view.dirtyFirst)}
        onClick={() => onChange({ dirtyFirst: !view.dirtyFirst })}
      >
        {tx.dirtyFirst}
      </Button>
    </div>
  );
}
