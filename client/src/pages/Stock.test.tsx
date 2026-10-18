import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '@app/shared';
import { mockApi } from '@/test/fetch';

const start = (role = 'admin', extra: object = {}) =>
  mockApi((_method, path) => {
    if (path === '/auth/me') return { status: 200, body: { role } };
    if (path === '/data') {
      return {
        status: 200,
        body: {
          items: [{ id: 'i1', name: 'Towels', multipliers: {} }],
          groups: [{ id: 'g1', name: 'DOUBLE' }],
          ...{ records: {}, groupRecords: {}, locations: [], counts: {} },
          ...{ tasks: [], checks: {}, notes: {}, stockCards: [], settings: {} },
          ...extra,
        },
      };
    }
    return { status: 200, body: {} };
  });

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollTo ??= () => {}; // the overview centres the day; jsdom lacks it
  window.history.replaceState(null, '', '/stock');
});
afterEach(() => vi.unstubAllGlobals());

const cards = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
/** The draggable wrapper around a card (the Card's parent). */
const wrapper = (title: string) =>
  screen.getByRole('heading', { level: 3, name: title }).closest('.border')!.parentElement!;

describe('stock page', () => {
  it('lets the admin move a card with the arrow keys on its grip', async () => {
    const fetch = start();
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    render(<App />);

    const grip = await screen.findByRole('button', { name: 'Move Overview' });
    expect(cards()).toEqual(['Departures', 'Stock', 'Overview']);
    grip.focus();
    await user.keyboard('{ArrowUp}');
    expect(cards()).toEqual(['Departures', 'Overview', 'Stock']);
    expect(fetch).toHaveBeenCalledWith(
      '/api/stock-cards/order',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ order: ['departures', 'overview', 'items'] }),
      }),
    );
  });

  it('keeps Departures and Stock in one row while they are next to each other', async () => {
    start();
    const { default: App } = await import('../App');
    render(<App />);
    await screen.findByRole('heading', { name: 'Overview' });
    const row = wrapper('Departures').parentElement!;
    expect(wrapper('Stock').parentElement).toBe(row);
    expect(row.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]');
    expect(wrapper('Overview').parentElement).not.toBe(row);
  });

  it('drops a dragged card on the place of the card under the pointer', async () => {
    const fetch = start();
    const { default: App } = await import('../App');
    render(<App />);
    const grip = await screen.findByRole('button', { name: 'Move Overview' });
    // Departures | Stock side by side, Overview below them
    const boxes = {
      Departures: { top: 0, left: 0, bottom: 300, right: 300 },
      Stock: { top: 0, left: 324, bottom: 400, right: 900 },
      Overview: { top: 424, left: 0, bottom: 800, right: 900 },
    };
    for (const [title, box] of Object.entries(boxes)) {
      wrapper(title).getBoundingClientRect = () =>
        ({ ...box, height: box.bottom - box.top, width: box.right - box.left }) as DOMRect;
    }
    fireEvent.pointerDown(grip, { button: 0, clientX: 20, clientY: 440, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 500, clientY: 100, pointerId: 1 });
    expect(wrapper('Stock').className).toContain('ring-primary');
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(cards()).toEqual(['Departures', 'Overview', 'Stock']);
    expect(fetch).toHaveBeenCalledWith(
      '/api/stock-cards/order',
      expect.objectContaining({
        body: JSON.stringify({ order: ['departures', 'overview', 'items'] }),
      }),
    );
  });

  it('shows no grips to a worker', async () => {
    start('worker');
    const { default: App } = await import('../App');
    render(<App />);
    await screen.findByRole('heading', { name: 'Overview' });
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
  });

  it('opens an overview item to show its count per room', async () => {
    const today = formatDate(new Date());
    start('admin', {
      locations: [
        { id: 'r1', name: '1 level' },
        { id: 'r2', name: '2 level' },
      ],
      counts: { [today]: { r1: { i1: 3 }, gone: { i1: 2 } } },
    });
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    render(<App />);

    const toggle = await screen.findByRole('button', { name: 'Towels' });
    expect(screen.queryByText('1 level')).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const cellsOf = (label: string) => {
      const row = screen.getByText(label).closest('tr')!;
      const col = [...row.parentElement!.parentElement!.querySelectorAll('thead th')].findIndex(
        (th) => th.getAttribute('data-day') === today,
      );
      return row.children[col]!.textContent;
    };
    expect(cellsOf('1 level')).toBe('3');
    expect(cellsOf('2 level')).toBe('—');
    expect(cellsOf('Removed rooms')).toBe('2');

    await user.click(toggle);
    expect(screen.queryByText('1 level')).toBeNull();
  });
});
