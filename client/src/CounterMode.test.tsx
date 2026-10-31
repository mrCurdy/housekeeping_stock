import { formatDate, todayLocal } from '@app/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLongDate } from '@/context/DateContext';
import { mockApi } from '@/test/fetch';

const data = {
  items: [{ id: 'i1', name: 'Towels', multipliers: {} }],
  records: {},
  groups: [],
  groupRecords: {},
  locations: [{ id: 'l1', name: 'Store' }],
  counts: {},
  tasks: [],
  checks: {},
  notes: {},
  stockCards: [],
  settings: {},
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollTo ??= () => {}; // the Stock overview centres the day; jsdom lacks it
  // The router reads the URL when App is imported
  window.history.replaceState(null, '', '/stock');
  // jsdom has no canvas: the fireworks only mount their (blank) overlay
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('counter mode (QR session)', () => {
  it('shows only the Counter, for today, without the menu or tools', async () => {
    mockApi((_m, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'counter' } };
      if (path === '/data') return { status: 200, body: data };
    });
    const { default: App } = await import('./App');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Inventory count' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/counter');
    expect(await screen.findByText('Towels')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Stock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Checklist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(formatLongDate(formatDate(todayLocal()), 'en-GB')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('fires the fireworks when the last item of a room is counted', async () => {
    const counts: Record<string, Record<string, number>> = {};
    const twoItems = {
      ...data,
      items: [...data.items, { id: 'i2', name: 'Soap', multipliers: {} }],
    };
    mockApi((method, path, body) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'counter' } };
      if (path === '/data') return { status: 200, body: twoItems };
      if (method === 'PUT' && path.startsWith('/counts/')) {
        const [, , , loc, item] = path.split('/') as [string, string, string, string, string];
        (counts[loc] ??= {})[item] = (body as { value: number }).value;
        return { status: 200, body: structuredClone(counts) };
      }
    });
    const user = userEvent.setup();
    const { default: App } = await import('./App');
    const { container } = render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Next room' }));
    await user.type(await screen.findByLabelText('Towels'), '5{Enter}');
    expect(await screen.findByText('1 of 2 counted')).toBeInTheDocument();
    expect(container.querySelector('.salute')).toBeNull();
    await user.type(screen.getByLabelText('Soap'), '3{Enter}');
    expect(await screen.findByText('2 of 2 counted')).toBeInTheDocument();
    expect(container.querySelector('.salute')).not.toBeNull();
  });
});
