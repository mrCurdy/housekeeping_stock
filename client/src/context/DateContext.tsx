import { addDays, formatDate, parseDateLocal, todayLocal } from '@app/shared';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/** Days you can navigate to, relative to today. The Stock overview shows exactly this range. */
export const DAYS_BACK = 30;
export const DAYS_AHEAD = 7;

interface DateState {
  /** Selected day, 'YYYY-MM-DD' */
  date: string;
  today: string;
  minDate: string;
  maxDate: string;
  canPrev: boolean;
  canNext: boolean;
  /** Selects a day; ignored outside minDate … maxDate */
  setDate(date: string): void;
  prevDay(): void;
  nextDay(): void;
  goToToday(): void;
}

const DateContext = createContext<DateState | null>(null);

/** The selected day, shared by every page (so switching pages keeps it). */
export function DateProvider({ children }: { children: ReactNode }) {
  const [bounds] = useState(() => {
    const t = todayLocal();
    return {
      today: formatDate(t),
      minDate: formatDate(addDays(t, -DAYS_BACK)),
      maxDate: formatDate(addDays(t, DAYS_AHEAD)),
    };
  });
  const [date, setDateState] = useState(bounds.today);

  const value = useMemo<DateState>(() => {
    const { today, minDate, maxDate } = bounds;
    const setDate = (d: string) => {
      if (d >= minDate && d <= maxDate) setDateState(d);
    };
    const shift = (n: number) => setDate(formatDate(addDays(parseDateLocal(date), n)));
    return {
      date,
      ...bounds,
      canPrev: date > minDate,
      canNext: date < maxDate,
      setDate,
      prevDay: () => shift(-1),
      nextDay: () => shift(1),
      goToToday: () => setDateState(today),
    };
  }, [bounds, date]);

  return <DateContext value={value}>{children}</DateContext>;
}

export function useSelectedDate() {
  const ctx = use(DateContext);
  if (!ctx) throw new Error('useSelectedDate must be used inside <DateProvider>');
  return ctx;
}

/** "Sat, 17 Oct 2026" in the given locale (`useI18n().locale`). */
export const formatLongDate = (date: string, locale: string) =>
  parseDateLocal(date).toLocaleDateString(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
