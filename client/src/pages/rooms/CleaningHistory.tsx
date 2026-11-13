import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/format';

/** How many of a room's general cleanings are listed. */
export const HISTORY_SHOWN = 10;

/**
 * A room's general cleanings, newest first (the last `HISTORY_SHOWN`): "date · who". Renders
 * nothing when the room was never cleaned. Used by the cleaning page's dialog.
 */
export function CleaningHistory({ roomId, className }: { roomId: string; className?: string }) {
  const { data } = useStock();
  const { t, locale } = useI18n();
  const cleanings = data.cleanings[roomId] ?? [];
  if (cleanings.length === 0) return null;
  return (
    <ol
      aria-label={t.rooms.history}
      className={cn('flex flex-col gap-0.5 text-xs text-fg-muted', className)}
    >
      {cleanings.slice(0, HISTORY_SHOWN).map((c, i) => (
        <li key={`${c.date}-${i}`}>{t.rooms.setBy(formatLongDate(c.date, locale), c.by)}</li>
      ))}
    </ol>
  );
}
