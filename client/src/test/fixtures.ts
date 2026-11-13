import { addDays, emptyStockData, formatDate, type StockData } from '@app/shared';
import { mockApi } from './fetch';

/** Local dates around today (the pages open on today). */
export const today = formatDate(new Date());
export const yesterday = formatDate(addDays(new Date(), -1));

/**
 * A small dataset for page tests: two items counted yesterday (Towels 10, Sheets 4, and
 * Sheets has a manual total of 7 today), three checklist tasks and yesterday's shift note.
 * `extra` replaces whole top-level keys.
 */
export function stockFixture(extra: Partial<StockData> = {}): StockData {
  return {
    ...emptyStockData(),
    items: [
      { id: 'towels', name: 'Towels', multipliers: {} },
      { id: 'sheets', name: 'Sheets', multipliers: {} },
    ],
    records: {
      towels: { [yesterday]: { m: 10 } },
      sheets: { [yesterday]: { m: 4 }, [today]: { m: 7 } },
    },
    tasks: [
      { id: 'a', name: 'Beds', description: '' },
      { id: 'b', name: 'Bins', description: '' },
      { id: 'c', name: 'Mop', description: '' },
    ],
    notes: { [yesterday]: 'Lift is broken' },
    ...extra,
  };
}

type Route = Parameters<typeof mockApi>[0];

/**
 * Fakes the API for a whole-app test: `/auth/me` answers `role`, `/data` answers `data`,
 * `route` answers the rest (undefined = `200 {}`). Returns the fetch mock.
 */
export function mockApp(role: string, data: StockData = stockFixture(), route?: Route) {
  return mockApi((method, path, body) => {
    if (path === '/auth/me') return { status: 200, body: { role } };
    if (path === '/data') return { status: 200, body: data };
    return route?.(method, path, body) ?? { status: 200, body: {} };
  });
}
