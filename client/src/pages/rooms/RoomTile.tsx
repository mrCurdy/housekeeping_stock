import type { Room } from '@app/shared';
import { Wrench } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { statusName } from './roomText';
import { worstStatus } from './roomView';

/**
 * A room as a small square tile (the compact view): number, type and a wrench coloured by the worst
 * unit status (none without units). Tapping it opens the card.
 */
export function RoomTile({ room, onOpen }: { room: Room; onOpen: () => void }) {
  const { data } = useStock();
  const tx = useI18n().t.rooms;
  const type = data.roomTypes.find((rt) => rt.id === room.type);
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
      {worst && worstLabel && (
        <Wrench
          role="img"
          aria-label={worstLabel}
          className={cn('h-4 w-4', ROOM_COLOR_CLASSES[worst.color].text)}
        >
          <title>{worstLabel}</title>
        </Wrench>
      )}
    </button>
  );
}
