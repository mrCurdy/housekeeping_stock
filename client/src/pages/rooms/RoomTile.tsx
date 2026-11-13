import { cleanThresholds, cleaningLevel, formatDate, latestCleaning, type Room } from '@app/shared';
import { Brush, Wrench } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { cleaningText, statusName } from './roomText';
import { worstStatus } from './roomView';

/**
 * A room as a small square tile (the compact view): number, type, a broom coloured by the general
 * cleaning and a wrench by the worst unit status (none without units). Tapping it opens the card.
 */
export function RoomTile({ room, onOpen }: { room: Room; onOpen: () => void }) {
  const { data } = useStock();
  const tx = useI18n().t.rooms;
  const type = data.roomTypes.find((rt) => rt.id === room.type);
  const last = latestCleaning(data, room.id);
  // counts from the real today, as on the card
  const clean = cleaningLevel(last?.date, formatDate(new Date()), cleanThresholds(data.settings));
  const cleanLabel = cleaningText(clean.days, last?.by ?? '', tx);
  const worst = worstStatus(data, room.id);
  const worstLabel = worst && tx.filter.unitsStatus(statusName(worst, tx.defaultStatus));

  return (
    <button
      type="button"
      aria-label={tx.filter.openRoom(room.number)}
      onClick={onOpen}
      className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface p-2 text-center shadow-card transition-colors hover:bg-surface-2 focus-ring cursor-pointer"
    >
      <span className="max-w-full text-lg leading-tight font-semibold break-words text-fg">
        {room.number}
      </span>
      {type && (
        <span className="max-w-full truncate text-xs text-fg-muted" title={type.name}>
          {type.name}
        </span>
      )}
      <span className="flex items-center gap-2">
        <Brush
          role="img"
          aria-label={cleanLabel}
          className={cn('h-4 w-4', ROOM_COLOR_CLASSES[clean.color].text)}
        >
          <title>{cleanLabel}</title>
        </Brush>
        {worst && worstLabel && (
          <Wrench
            role="img"
            aria-label={worstLabel}
            className={cn('h-4 w-4', ROOM_COLOR_CLASSES[worst.color].text)}
          >
            <title>{worstLabel}</title>
          </Wrench>
        )}
      </span>
    </button>
  );
}
