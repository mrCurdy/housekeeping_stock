import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui';
import { fieldClass } from '@/components/ui/Input';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';

/** ‹ room › : a full-width room picker sized like the count rows, easy to hit on a phone. */
export function RoomSwitcher({
  locationId,
  progress,
}: {
  locationId: string | undefined;
  progress: (locId: string) => number;
}) {
  const { data } = useStock();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pages = ['', ...data.locations.map((l) => l.id)]; // '' = all rooms
  const index = Math.max(0, pages.indexOf(locationId ?? '')); // a removed room shows all rooms
  const go = (id: string | undefined) => {
    if (id !== undefined) void navigate(id ? `/counter/${id}` : '/counter');
  };

  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3">
      <Button
        variant="outline"
        size="icon"
        className="h-12 w-12 shrink-0 rounded-lg"
        onClick={() => go(pages[index - 1])}
        disabled={index <= 0}
        aria-label={t.counter.prevRoom}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div className="relative min-w-0 flex-1">
        <select
          aria-label={t.counter.chooseRoom}
          className={cn(fieldClass, 'h-12 appearance-none truncate pr-10 text-base font-semibold')}
          value={pages[index]}
          onChange={(e) => go(e.target.value)}
        >
          <option value="">{t.counter.allRooms}</option>
          {data.locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {`${loc.name || t.common.unnamedRoom} · ${progress(loc.id)}/${data.items.length}`}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-fg-muted" />
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-12 w-12 shrink-0 rounded-lg"
        onClick={() => go(pages[index + 1])}
        disabled={index >= pages.length - 1}
        aria-label={t.counter.nextRoom}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
