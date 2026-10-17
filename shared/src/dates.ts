// Dates are local-time 'YYYY-MM-DD' strings, so plain string comparison sorts them correctly.

export const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDateLocal = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0);
};

export const addDays = (date: Date, n: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

export const todayLocal = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Every date from `from` to `to` (inclusive). */
export function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const end = parseDateLocal(to);
  for (let d = parseDateLocal(from); d <= end; d.setDate(d.getDate() + 1)) days.push(formatDate(d));
  return days;
}
