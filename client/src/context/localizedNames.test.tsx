import { act, render, screen, waitFor } from '@testing-library/react';
import { emptyStockData, type StockData } from '@app/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { DateProvider } from '@/context/DateContext';
import { I18nProvider, useI18n } from '@/context/I18nContext';
import { StockProvider, useStock } from '@/context/StockContext';
import { ToastProvider } from '@/context/ToastContext';
import { mockApi } from '@/test/fetch';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const dataset = (): StockData => ({
  ...emptyStockData(),
  items: [{ id: 'i', name: 'Rätik', names: { en: 'Towel' }, multipliers: {} }],
  roomUnits: [{ id: 'u', name: 'Voodi' }],
  roomStatuses: [{ id: 's', name: 'Korras', color: 'green', names: { ru: 'Порядок' } }],
});

/** Shows the names as the app sees them, plus language and rename buttons. */
function Consumer() {
  const { data, rawData, loading, updateItem, renameRoomUnit } = useStock();
  const { setLang } = useI18n();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <output aria-label="item">{data.items[0]?.name}</output>
      <output aria-label="unit">{data.roomUnits[0]?.name}</output>
      <output aria-label="status">{data.roomStatuses[0]?.name}</output>
      <output aria-label="raw">{JSON.stringify(rawData.items[0])}</output>
      {(['en', 'et', 'ru'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)}>
          {l}
        </button>
      ))}
      <button onClick={() => updateItem('i', { name: 'Hand towel' })}>rename item</button>
      <button onClick={() => renameRoomUnit('u', 'Bed')}>rename unit</button>
    </div>
  );
}

const shown = (name: string) => screen.getByRole('status', { name }).textContent;
const click = (name: string) => act(() => screen.getByRole('button', { name }).click());

describe('names in several languages', () => {
  it('shows the version of the current language, else the base name; a rename sends the language', async () => {
    localStorage.setItem('lang', 'et');
    const fetch = mockApi((method, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') return { status: 200, body: dataset() };
      if (method === 'PATCH') return { status: 200, body: {} };
    });
    render(
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <DateProvider>
              <StockProvider>
                <Consumer />
              </StockProvider>
            </DateProvider>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>,
    );
    await waitFor(() => expect(shown('item')).toBe('Rätik'));
    expect(shown('unit')).toBe('Voodi');
    expect(shown('status')).toBe('Korras');

    await click('en');
    expect(shown('item')).toBe('Towel');
    expect(shown('unit')).toBe('Voodi');
    await click('ru');
    expect(shown('item')).toBe('Rätik');
    expect(shown('status')).toBe('Порядок');

    await click('en');
    await click('rename item');
    await click('rename unit');
    expect(shown('item')).toBe('Hand towel');
    expect(shown('unit')).toBe('Bed');
    const patches = fetch.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([url, init]) => [url, JSON.parse(init!.body as string)]);
    expect(patches).toEqual([
      ['/api/items/i', { name: 'Hand towel', lang: 'en' }],
      ['/api/room-units/u', { name: 'Bed', lang: 'en' }],
    ]);
    // Backup gets every version
    expect(JSON.parse(shown('raw')!)).toMatchObject({ name: 'Rätik', names: { en: 'Hand towel' } });

    await click('et');
    expect(shown('item')).toBe('Rätik');
    expect(shown('unit')).toBe('Voodi');
  });
});
