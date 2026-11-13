import { parseDateLocal } from '@app/shared';

/** "Sat, 17 Oct 2026" in the given locale (`useI18n().locale`). */
export const formatLongDate = (date: string, locale: string) =>
  parseDateLocal(date).toLocaleDateString(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
