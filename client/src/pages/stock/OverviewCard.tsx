import { addDays, dateRange, formatDate, parseDateLocal } from '@app/shared';
import { ChevronDown } from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { useRoomStatus } from './useRoomStatus';
import { StockCardHeader } from './StockCardHeader';

/**
 * End-of-day stock for every day you can navigate to (today −30 … +7), scrolling sideways with
 * the item names pinned. Days without consumption, income or a count show "—". Future days stop at
 * tomorrow (or the selected day) unless something is entered later.
 */
type Day = { counted: boolean; consumption: number; income: number };
const entered = (f: Day) => f.counted || f.consumption !== 0 || f.income !== 0;

export function OverviewCard({ grip }: { grip?: ReactNode }) {
  const { data, math } = useStock();
  const { date, today, minDate, maxDate, setDate } = useSelectedDate();
  const roomStatus = useRoomStatus();
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);

  // One replay per item instead of one per cell
  const series = useMemo(
    () => new Map(data.items.map((item) => [item.id, math.series(item, maxDate)])),
    [data.items, math, maxDate],
  );

  // Future columns end at tomorrow, the selected day or the last day with an entry
  const lastDay = useMemo(() => {
    const tomorrow = formatDate(addDays(parseDateLocal(today), 1));
    let last = date > tomorrow ? date : tomorrow;
    for (const fs of series.values())
      for (const [str, f] of fs) if (str > last && entered(f)) last = str;
    return last < maxDate ? last : maxDate;
  }, [series, today, date, maxDate]);

  const days = useMemo(
    () =>
      dateRange(minDate, lastDay).map((str) => {
        const d = parseDateLocal(str);
        return {
          str,
          weekday: d.toLocaleDateString(locale, { weekday: 'short' }),
          label: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        };
      }),
    [minDate, lastDay, locale],
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

  // Items opened to show their count per room (like a task's instructions)
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Counts from rooms removed since still count in the totals, so they get a row of their own
  const removedIds = useMemo(() => {
    const known = new Set(data.locations.map((l) => l.id));
    const ids = new Set<string>();
    for (const { str } of days)
      for (const id of Object.keys(data.counts[str] ?? {})) if (!known.has(id)) ids.add(id);
    return [...ids];
  }, [data.locations, data.counts, days]);
  const hasRooms = data.locations.length > 0 || removedIds.length > 0;

  type RoomRow = {
    key: string;
    label: string;
    title?: string;
    value: (date: string) => number | null;
  };
  const roomRows = (itemId: string): RoomRow[] => {
    const count = (date: string, roomId: string) => data.counts[date]?.[roomId]?.[itemId] ?? null;
    const rows: RoomRow[] = data.locations.map((room) => ({
      key: room.id,
      label: room.name,
      value: (date) => count(date, room.id),
    }));
    const removed = (date: string) =>
      removedIds.reduce<number | null>((sum, id) => {
        const v = count(date, id);
        return v == null ? sum : (sum ?? 0) + v;
      }, null);
    if (days.some(({ str }) => removed(str) != null))
      rows.push({
        key: 'removed',
        label: t.counter.removedRooms,
        title: t.counter.removedRoomsHint,
        value: removed,
      });
    return rows;
  };

  const pinned = 'sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--border)]';
  const dayTint = (str: string) =>
    cn(
      str === today && 'bg-primary-soft/50',
      str === date && 'outline-2 -outline-offset-2 outline-primary',
    );

  return (
    <Card>
      <StockCardHeader
        title={t.stock.overview.title}
        description={t.stock.overview.description}
        grip={grip}
      />
      <div ref={scroller} className="overflow-x-auto scrollbar-thick">
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
            {data.items.map((item) => {
              const name = item.name || t.common.unnamedItem;
              const isOpen = open.has(item.id);
              const panelId = `overview-rooms-${item.id}`;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className={cn(pinned, 'px-4 py-2.5 font-medium whitespace-nowrap')}>
                      {hasRooms ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          title={isOpen ? t.stock.overview.hideRooms : t.stock.overview.showRooms}
                          onClick={() => toggle(item.id)}
                          className="focus-ring -my-1 flex w-full items-center justify-between gap-3 rounded-md py-1 text-left"
                        >
                          {name}
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-fg-muted transition-transform',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                      ) : (
                        name
                      )}
                    </td>
                    {days.map((day) => {
                      const f = series.get(item.id)?.get(day.str);
                      if (!f || !entered(f)) {
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
                  {isOpen &&
                    roomRows(item.id).map((row, i, rows) => (
                      <tr
                        key={row.key}
                        id={i === 0 ? panelId : undefined}
                        className={cn(
                          'animate-fade-in bg-surface-2 text-xs',
                          i === rows.length - 1 && 'border-b-2 border-fg-muted/40',
                        )}
                      >
                        <td
                          title={row.title}
                          className={cn(
                            pinned,
                            'bg-surface-2 py-1.5 pr-4 pl-8 whitespace-nowrap text-fg-muted',
                          )}
                        >
                          {row.label}
                        </td>
                        {days.map((day) => {
                          const v = row.value(day.str);
                          return (
                            <td
                              key={day.str}
                              className={cn(
                                'px-3 py-1.5 text-right tabular-nums',
                                v == null ? 'text-fg-muted' : 'text-fg',
                                dayTint(day.str),
                              )}
                            >
                              {v ?? '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
