import { dateRange, parseDateLocal } from '@app/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { useRoomStatus } from './useRoomStatus';

/**
 * End-of-day stock for every day you can navigate to (today −30 … +7), scrolling sideways with
 * the item names pinned. Days without consumption, income or a count show "—".
 */
export function OverviewCard() {
  const { data, math } = useStock();
  const { date, today, minDate, maxDate, setDate } = useSelectedDate();
  const roomStatus = useRoomStatus();
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () =>
      dateRange(minDate, maxDate).map((str) => {
        const d = parseDateLocal(str);
        return {
          str,
          weekday: d.toLocaleDateString(locale, { weekday: 'short' }),
          label: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        };
      }),
    [minDate, maxDate, locale],
  );

  // One replay per item instead of one per cell
  const series = useMemo(
    () => new Map(data.items.map((item) => [item.id, math.series(item, maxDate)])),
    [data.items, math, maxDate],
  );

  // Keep the selected day in view, centred between earlier and later days
  const firstScroll = useRef(true);
  useEffect(() => {
    const wrap = scroller.current;
    const cell = wrap?.querySelector<HTMLElement>(`[data-day="${date}"]`);
    if (!wrap || !cell) return;
    const nameWidth = wrap.querySelector<HTMLElement>('th')?.offsetWidth ?? 0;
    const left =
      cell.offsetLeft - nameWidth - (wrap.clientWidth - nameWidth - cell.offsetWidth) / 2;
    wrap.scrollTo({ left: Math.max(0, left), behavior: firstScroll.current ? 'auto' : 'smooth' });
    firstScroll.current = false;
  }, [date]);

  const pinned = 'sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--border)]';
  const dayTint = (str: string) =>
    cn(
      str === today && 'bg-primary-soft/50',
      str === date && 'outline-2 -outline-offset-2 outline-primary',
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.stock.overview.title}</CardTitle>
        <CardDescription>{t.stock.overview.description}</CardDescription>
      </CardHeader>
      <div ref={scroller} className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th
                className={cn(
                  pinned,
                  'h-12 px-4 text-left text-xs font-medium tracking-wide text-fg-muted uppercase',
                )}
              >
                {t.common.stockName}
              </th>
              {days.map((day) => (
                <th
                  key={day.str}
                  data-day={day.str}
                  onClick={() => setDate(day.str)}
                  title={t.stock.overview.goToDay}
                  className={cn(
                    'min-w-19 cursor-pointer px-3 text-right text-xs font-medium whitespace-nowrap text-fg-muted hover:text-primary',
                    dayTint(day.str),
                  )}
                >
                  <div className="font-semibold text-fg">
                    {day.str === today ? t.common.today : day.weekday}
                  </div>
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className={cn(pinned, 'px-4 py-2.5 font-medium whitespace-nowrap')}>
                  {item.name || t.common.unnamedItem}
                </td>
                {days.map((day) => {
                  const f = series.get(item.id)?.get(day.str);
                  const active = f && (f.counted || f.consumption !== 0 || f.income !== 0);
                  if (!active) {
                    return (
                      <td
                        key={day.str}
                        title={t.stock.overview.nothingEntered}
                        className={cn('px-3 py-2.5 text-right text-fg-muted', dayTint(day.str))}
                      >
                        —
                      </td>
                    );
                  }
                  const rooms = !!roomStatus(item.id, day.str);
                  return (
                    <td
                      key={day.str}
                      className={cn(
                        'px-3 py-2.5 text-right font-semibold tabular-nums',
                        f.total < 0
                          ? 'val-short'
                          : rooms
                            ? 'val-rooms'
                            : f.counted
                              ? 'val-manual'
                              : 'val-calc',
                        dayTint(day.str),
                      )}
                    >
                      {f.total}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
