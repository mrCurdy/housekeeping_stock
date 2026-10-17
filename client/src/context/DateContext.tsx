import { addDays, formatDate, parseDateLocal, todayLocal, todayOnly } from '@app/shared';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

/** Days you can navigate to, relative to today. The Stock overview shows exactly this range. */
export const DAYS_BACK = 30;
export const DAYS_AHEAD = 7;

interface DateState {
  /** Selected day, 'YYYY-MM-DD' */
  date: string;
  today: string;
  minDate: string;
  maxDate: string;
  /** Only today can be picked (a QR counter session: `todayOnly(role)`) */
  locked: boolean;
  canPrev: boolean;
  canNext: boolean;
  /** Selects a day; ignored outside minDate … maxDate */
  setDate(date: string): void;
  prevDay(): void;
  nextDay(): void;
  goToToday(): void;
}

const DateContext = createContext<DateState | null>(null);

/**
 * The selected day, shared by every page (so switching pages keeps it). Roles that may only change
 * today (`todayOnly`) are locked to today.
 */
export function DateProvider({ children }: { children: ReactNode }) {
  const locked = todayOnly(useAuth().role);
  const [bounds] = useState(() => {
    const t = todayLocal();
    return {
      today: formatDate(t),
      minDate: formatDate(addDays(t, locked ? 0 : -DAYS_BACK)),
      maxDate: formatDate(addDays(t, locked ? 0 : DAYS_AHEAD)),
      locked,
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
