import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApp, stockFixture } from '@/test/fixtures';

const UNTRANSLATED =
  'Not yet translated into this language. To keep this text, press Enter in its name field.';

/** Towels has an English version; Sheets only its base name (shown as a fallback in English). */
const data = () =>
  stockFixture({
    items: [
      { id: 'towels', name: 'Rätikud', names: { en: 'Towels' }, multipliers: {} },
      { id: 'sheets', name: 'Sheets', multipliers: {} },
    ],
  });

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollTo ??= () => {};
  window.history.replaceState(null, '', '/stock');
});
afterEach(() => vi.unstubAllGlobals());

describe('names without a version in the UI language', () => {
  it('the admin sees a fallback name marked, a translated one not', async () => {
    mockApp('admin', data());
    const { default: App } = await import('../App');
    render(<App />);

    const towels = await screen.findByDisplayValue('Towels');
    const sheets = screen.getByDisplayValue('Sheets');
    expect(sheets).toHaveClass('text-untranslated');
    expect(sheets).toHaveAttribute('title', UNTRANSLATED);
    expect(towels).not.toHaveClass('text-untranslated');
    expect(towels).not.toHaveAttribute('title');
  });

  it('Enter on an unchanged fallback name saves it in the UI language', async () => {
    const fetch = mockApp('admin', data());
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    render(<App />);

    const sheets = await screen.findByDisplayValue('Sheets');
    await user.click(sheets);
    await user.keyboard('{Enter}');
    expect(fetch).toHaveBeenCalledWith(
      '/api/items/sheets',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Sheets', lang: 'en' }),
      }),
    );
    expect(screen.getByDisplayValue('Sheets')).not.toHaveClass('text-untranslated');

    // a translated name left unchanged sends nothing
    fetch.mockClear();
    await user.click(screen.getByDisplayValue('Towels'));
    await user.keyboard('{Enter}');
    expect(fetch).not.toHaveBeenCalledWith('/api/items/towels', expect.anything());
  });

  it('a housekeeper never sees the mark', async () => {
    // the Stock page needs `daily`, so the housekeeper is given it here
    mockApp('housekeeper', {
      ...data(),
      settings: { rolePermissions: { housekeeper: ['daily'], reception: [] } },
    });
    const { default: App } = await import('../App');
    render(<App />);

    const sheets = await screen.findByText('Sheets', { selector: 'span' });
    expect(sheets).not.toHaveClass('text-untranslated');
    expect(sheets).not.toHaveAttribute('title');
  });
});
