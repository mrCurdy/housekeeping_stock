import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';

/** ‹ date › Today: picks the day every page works on. Just the date when it is locked to today. */
export function DateSwitcher() {
  const { t, locale } = useI18n();
  const { date, today, locked, canPrev, canNext, prevDay, nextDay, goToToday } = useSelectedDate();
  if (locked) return null; // the page description already shows the date
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={prevDay}
        disabled={!canPrev}
        aria-label={t.date.prev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-36 text-center text-sm font-semibold">
        {formatLongDate(date, locale)}
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={nextDay}
        disabled={!canNext}
        aria-label={t.date.next}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" onClick={goToToday} disabled={date === today}>
        {t.common.today}
      </Button>
    </div>
  );
}
