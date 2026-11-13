import { latestCleaning, type Room } from '@app/shared';
import { Brush } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { cleaningText } from '../rooms/roomText';
import { cleaningDays } from '../rooms/roomView';

/**
 * A room on the Cleaning page: a square button with the number and, under it, a broom and the days
 * since the latest general cleaning (`0` today, "—" never), coloured by the thresholds. Its
 * accessible name says it in words ("Room 101: Cleaned 12 days ago · Anna"). Tapping opens the dialog.
 */
export function CleaningTile({
  room,
  today,
  onOpen,
}: {
  room: Room;
  today: string;
  onOpen: () => void;
}) {
  const { data } = useStock();
  const { t } = useI18n();
  const { days, color } = cleaningDays(data, room.id, today);
  const state = cleaningText(days, latestCleaning(data, room.id)?.by ?? '', t.rooms);
  const label = t.cleaning.tile(room.number, state);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className="flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface p-1.5 text-center shadow-card transition-colors hover:bg-surface-2 focus-ring"
    >
      <span className="max-w-full text-base leading-tight font-semibold break-words text-fg">
        {room.number}
      </span>
      <span aria-hidden className="flex items-center gap-1 text-sm font-semibold tabular-nums">
        <Brush className="h-4 w-4 text-fg-muted" />
        <span className={ROOM_COLOR_CLASSES[color].text}>{days ?? '—'}</span>
      </span>
    </button>
  );
}
