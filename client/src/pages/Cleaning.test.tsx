import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatDate, type StockData } from '@app/shared';
import { mockApp, stockFixture, today } from '@/test/fixtures';

const daysAgo = (n: number) => formatDate(addDays(new Date(), -n));

/** 101 cleaned today, 102 30 days ago (red with the default thresholds), 205 never, 2 yesterday. */
const hotel = (extra: Partial<StockData> = {}) =>
  stockFixture({
    rooms: [
      { id: 'r101', number: '101', type: 'dbl' },
      { id: 'r102', number: '102' },
      { id: 'r205', number: '205' },
      { id: 'r2', number: '2', type: 'dbl' },
    ],
    roomTypes: [{ id: 'dbl', name: 'Double' }],
    cleanings: {
      r101: [{ date: today, by: 'Ann' }],
      r102: [
        { date: daysAgo(30), by: 'Mari' },
        { date: daysAgo(40), by: 'Bob' },
      ],
      r2: [{ date: daysAgo(1), by: 'Eve' }],
    },
    ...extra,
  });

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  // jsdom has no <dialog> methods
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  Element.prototype.scrollTo ??= () => {};
  window.history.replaceState(null, '', '/cleaning');
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const renderApp = async () => {
  const { default: App } = await import('../App');
  return render(<App />);
};

const tile = (number: string) =>
  screen.getByRole('button', { name: new RegExp(`^Room ${number}: `) });
/** The tiles' room numbers in screen order. */
const order = () =>
  screen
    .getAllByRole('button', { name: /^Room \S+: / })
    .map((b) => /^Room (\S+):/.exec(b.getAttribute('aria-label') ?? '')![1]);

const loaded = () => screen.findByRole('button', { name: /^Room 101: / });

describe('cleaning page', () => {
  it('tiles show the number and the coloured days since the latest cleaning', async () => {
    mockApp('admin', hotel());
    await renderApp();
    await loaded();

    const t101 = tile('101');
    expect(t101).toHaveAccessibleName('Room 101: Cleaned today · Ann');
    expect(within(t101).getByText('101')).toBeInTheDocument();
    expect(within(t101).getByText('0')).toHaveClass('text-status-green');
    expect(t101).toHaveClass('border-status-green');

    const t102 = tile('102');
    expect(t102).toHaveAccessibleName('Room 102: Cleaned 30 days ago · Mari');
    expect(within(t102).getByText('30')).toHaveClass('text-status-red');
    expect(t102).toHaveClass('border-status-red');

    const t205 = tile('205');
    expect(t205).toHaveAccessibleName('Room 205: No general cleaning yet');
    expect(within(t205).getByText('—')).toHaveClass('text-status-red');
  });

  it('dirty first puts never-cleaned on top, then most days; pressing it again restores level order', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await loaded();
    expect(order()).toEqual(['101', '102', '2', '205']);

    const dirty = screen.getByRole('button', { name: 'Dirty first' });
    await user.click(dirty);
    expect(dirty).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toEqual(['205', '102', '2', '101']);

    await user.click(dirty);
    expect(order()).toEqual(['101', '102', '2', '205']);
  });

  it('remembers dirty first and the level on this device', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    const { unmount } = await renderApp();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Dirty first' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    unmount();
    await renderApp();
    await loaded();
    expect(order()).toEqual(['102', '101']);
    expect(screen.getByRole('button', { name: 'Dirty first' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('level buttons and search filter; no match → Show all', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await loaded();

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(order()).toEqual(['2', '205']);

    // a search looks across every level
    await user.type(screen.getByRole('textbox', { name: 'Search rooms' }), '10');
    expect(order()).toEqual(['101', '102']);
    await user.clear(screen.getByRole('textbox', { name: 'Search rooms' }));
    await user.type(screen.getByRole('textbox', { name: 'Search rooms' }), 'dou');
    expect(screen.getByText('No rooms match')).toBeInTheDocument(); // types don't match

    await user.clear(screen.getByRole('textbox', { name: 'Search rooms' }));
    await user.type(screen.getByRole('textbox', { name: 'Search rooms' }), '9');
    expect(screen.getByText('No rooms match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(order()).toEqual(['101', '102', '2', '205']);
    expect(screen.getByRole('textbox', { name: 'Search rooms' })).toHaveValue('');
  });

  it('a tile opens a dialog with the latest cleaning and the history; Cleaned today registers it and salutes', async () => {
    const fetch = mockApp('admin', hotel(), (method, path, body) =>
      method === 'POST' && path === '/rooms/r102/cleanings'
        ? {
            status: 201,
            body: [body, { date: daysAgo(30), by: 'Mari' }, { date: daysAgo(40), by: 'Bob' }],
          }
        : undefined,
    );
    const user = userEvent.setup();
    await renderApp();
    await loaded();

    await user.click(tile('102'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Room 102' })).toBeInTheDocument();
    expect(within(dialog).getByText('Cleaned 30 days ago · Mari')).toBeInTheDocument();
    const history = within(dialog).getByRole('list', { name: 'Cleaning history' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('Mari');

    const name = within(dialog).getByRole('textbox', { name: 'Your name' });
    const confirm = within(dialog).getByRole('button', { name: 'Cleaned today' });
    expect(name).toHaveValue('');
    expect(confirm).toBeDisabled();
    await user.type(name, '  Kati ');
    expect(document.querySelector('.salute')).toBeNull();
    await user.click(confirm);
    expect(document.querySelector('.salute')).not.toBeNull();

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/rooms/r102/cleanings',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetch.mock.calls.find(([url]) => url === '/api/rooms/r102/cleanings')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ date: today, by: 'Kati' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tile('102')).toHaveAccessibleName('Room 102: Cleaned today · Kati');
    expect(within(tile('102')).getByText('0')).toHaveClass('text-status-green');

    // the name is remembered for the next dialog
    await user.click(tile('205'));
    expect(within(screen.getByRole('dialog')).getByText('No general cleaning yet')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Kati');
  });

  it('Cancel sends nothing', async () => {
    const fetch = mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await loaded();
    await user.click(tile('205'));
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Kati');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(tile('205')).toHaveAccessibleName('Room 205: No general cleaning yet');
    expect(document.querySelector('.salute')).toBeNull();
  });

  it('no rooms: the admin gets a Settings link', async () => {
    mockApp('admin', hotel({ rooms: [], cleanings: {} }));
    await renderApp();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument();
  });
});

describe('cleaning page for a worker', () => {
  it('a worker sees the page and its NAV entry, but no Room statuses', async () => {
    mockApp('worker', hotel());
    await renderApp();
    await loaded();
    expect(window.location.pathname).toBe('/cleaning');
    expect(screen.getAllByRole('link', { name: 'Cleaning' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Room statuses' })).toBeNull();
  });

  it('no rooms: a worker is told to ask the admin', async () => {
    mockApp('worker', hotel({ rooms: [], cleanings: {} }));
    await renderApp();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
    expect(screen.getByText('Ask the admin to set this up.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Settings' })).toBeNull();
  });
});
