import { formatDate, todayLocal } from '@app/shared';
import { render, screen } from '@testing-library/react';
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
});
afterEach(() => vi.unstubAllGlobals());

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
});
