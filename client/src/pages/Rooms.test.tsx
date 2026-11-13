import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatDate, type StockData } from '@app/shared';
import { mockApp, stockFixture, today } from '@/test/fixtures';

const daysAgo = (n: number) => formatDate(addDays(new Date(), -n));

const rooms = (extra: Partial<StockData> = {}) =>
  stockFixture({
    rooms: [
      { id: 'r10', number: '10' },
      { id: 'r2', number: '2', type: 'dbl', note: 'Sea view' },
    ],
    roomTypes: [{ id: 'dbl', name: 'Double' }],
    roomUnits: [
      { id: 'bed', name: 'Bed' },
      { id: 'shower', name: 'Shower' },
    ],
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
  window.history.replaceState(null, '', '/rooms');
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const card = (number: string) => screen.getByRole('article', { name: `Room ${number}` });

const renderApp = async () => {
  const { default: App } = await import('../App');
  return render(<App />);
};

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('rooms page', () => {
  it('shows the cards level by level with type and note', async () => {
    mockApp('admin', rooms());
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '2' });
    expect(titles()).toEqual(['10', '2']);
    expect(within(card('2')).getByText('Double')).toBeInTheDocument();
    expect(within(card('2')).getByRole('textbox', { name: 'Room note 2' })).toHaveValue('Sea view');
    expect(within(card('10')).getByText('No general cleaning yet')).toBeInTheDocument();
  });

  it('creates a card', async () => {
    const fetch = mockApp('admin', rooms(), (method, path) =>
      method === 'POST' && path === '/rooms'
        ? { status: 201, body: { id: 'r101', number: '101', type: 'dbl' } }
        : undefined,
    );
    const user = userEvent.setup();
    await renderApp();

    await user.type(await screen.findByRole('textbox', { name: 'Room number' }), '101');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Room type' }), 'dbl');
    await user.click(screen.getByRole('button', { name: 'Add room' }));
    expect(await screen.findByRole('heading', { level: 3, name: '101' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ number: '101', type: 'dbl' }),
      }),
    );
  });

  it('refuses a number that already exists', async () => {
    const fetch = mockApp('admin', rooms());
    const user = userEvent.setup();
    await renderApp();

    await user.type(await screen.findByRole('textbox', { name: 'Room number' }), '10');
    await user.click(screen.getByRole('button', { name: 'Add room' }));
    expect(screen.getByText('Room 10 already exists')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/api/rooms', expect.anything());
  });

  it('saves the note on blur', async () => {
    const fetch = mockApp('admin', rooms());
    const user = userEvent.setup();
    await renderApp();

    const note = await screen.findByRole('textbox', { name: 'Room note 10' });
    await user.type(note, 'Bathtub, no shower');
    await user.tab();
    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/r10',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ note: 'Bathtub, no shower' }),
      }),
    );
  });

  it('changes a status through the dialog; Cancel sends nothing', async () => {
    const fetch = mockApp('admin', rooms(), (method, path, body) =>
      method === 'PUT' && path === '/rooms/r10/units/bed'
        ? { status: 200, body: { ...(body as object), at: new Date().toISOString() } }
        : undefined,
    );
    const user = userEvent.setup();
    await renderApp();

    const select = await screen.findByRole('combobox', { name: 'Status of Bed in room 10' });
    expect(select).toHaveValue('ok');

    await user.selectOptions(select, 'fix');
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Mari');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(select).toHaveValue('ok');
    expect(fetch).not.toHaveBeenCalledWith('/api/rooms/r10/units/bed', expect.anything());

    await user.selectOptions(select, 'fix');
    dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Mari');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Broken leg');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/r10/units/bed',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'fix', by: 'Mari', note: 'Broken leg' }),
      }),
    );
    await waitFor(() => expect(select).toHaveValue('fix'));
    expect(within(card('10')).getByText('Broken leg')).toBeInTheDocument();
    expect(within(card('10')).getByText(/Mari/)).toBeInTheDocument();
  });

  it('needs a name before confirming', async () => {
    mockApp('admin', rooms());
    const user = userEvent.setup();
    await renderApp();

    await user.click(
      within(await screen.findByRole('article', { name: 'Room 10' })).getByRole('button', {
        name: 'Cleaned',
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    ).toBeDisabled();
  });

  it('Cleaned → "Cleaned today · Name", and the name is remembered', async () => {
    const fetch = mockApp('worker', rooms(), (method, path) =>
      method === 'POST' && path === '/rooms/r10/cleanings'
        ? { status: 201, body: [{ date: today, by: 'Mari' }] }
        : undefined,
    );
    const user = userEvent.setup();
    await renderApp();

    await screen.findByRole('heading', { level: 3, name: '10' });
    await user.click(within(card('10')).getByRole('button', { name: 'Cleaned' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('textbox', { name: 'Note' })).toBeNull();
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Mari');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await within(card('10')).findByText('Cleaned today · Mari')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/r10/cleanings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ date: today, by: 'Mari' }),
      }),
    );

    await user.click(within(card('2')).getByRole('button', { name: 'Cleaned' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Your name' }),
    ).toHaveValue('Mari');
  });

  it('colours the cleaning line by the thresholds', async () => {
    mockApp(
      'admin',
      rooms({
        rooms: [
          { id: 'a', number: '1' },
          { id: 'b', number: '2' },
          { id: 'c', number: '3' },
        ],
        cleanings: {
          a: [{ date: daysAgo(1), by: 'Ann' }],
          b: [{ date: daysAgo(5), by: 'Bob' }],
          c: [
            { date: daysAgo(9), by: 'Cy' },
            { date: daysAgo(20), by: 'Dee' },
          ],
        },
        settings: { cleanGreenDays: 3, cleanYellowDays: 8 },
      }),
    );
    const user = userEvent.setup();
    await renderApp();

    expect(await screen.findByText('Cleaned yesterday · Ann')).toHaveClass('text-status-green');
    expect(screen.getByText('Cleaned 5 days ago · Bob')).toHaveClass('text-status-yellow');
    expect(screen.getByText('Cleaned 9 days ago · Cy')).toHaveClass('text-status-red');

    await user.click(within(card('3')).getByRole('button', { name: 'Cleaning history' }));
    expect(within(card('3')).getByText(/Dee/)).toBeInTheDocument();
  });

  it('renames a card and deletes it after confirming', async () => {
    const fetch = mockApp('admin', rooms());
    const user = userEvent.setup();
    await renderApp();

    await user.click(
      within(await screen.findByRole('article', { name: 'Room 10' })).getByRole('button', {
        name: 'Edit room 10',
      }),
    );
    const number = within(card('10')).getByRole('textbox', { name: 'Room number' });
    await user.clear(number);
    await user.type(number, '11');
    await user.click(within(card('10')).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 3, name: '11' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/r10',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ number: '11' }) }),
    );

    await user.click(within(card('11')).getByRole('button', { name: 'Edit room 11' }));
    await user.click(within(card('11')).getByRole('button', { name: 'Delete room 11' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('heading', { level: 3, name: '11' })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/r10',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('without units the admin gets a link to Settings', async () => {
    mockApp('admin', rooms({ roomUnits: [] }));
    await renderApp();
    expect(await screen.findByText('No room units set up yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('a worker sees the page but no Settings link', async () => {
    mockApp('worker', rooms({ roomUnits: [] }));
    await renderApp();
    expect(await screen.findByText('No room units set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Settings' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Rooms' })).toBeInTheDocument();
  });

  it('shows the empty state without rooms', async () => {
    mockApp('admin', rooms({ rooms: [] }));
    await renderApp();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
  });
});

describe('rooms filter bar', () => {
  const by = { by: 'Ann', at: '2026-11-01T10:00:00.000Z' };
  /** 101 all green, 102 yellow, 201 red. */
  const floors = () =>
    rooms({
      rooms: ['201', '102', '101'].map((number) => ({ id: `r${number}`, number })),
      unitStatus: {
        r102: { bed: { status: 'attention', ...by } },
        r201: { shower: { status: 'fix', ...by } },
      },
    });
  const levels = () => screen.getByRole('group', { name: 'Level' });
  const pressed = (name: string) =>
    within(levels()).getByRole('button', { name }).getAttribute('aria-pressed');

  it('level buttons come from the rooms; one shows only that level, All shows all', async () => {
    mockApp('worker', floors());
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });

    expect(
      within(levels())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All rooms', '1', '2']);
    expect(pressed('All rooms')).toBe('true');

    await user.click(within(levels()).getByRole('button', { name: '2' }));
    expect(titles()).toEqual(['201']);
    expect(pressed('2')).toBe('true');
    expect(pressed('All rooms')).toBe('false');

    await user.click(within(levels()).getByRole('button', { name: 'All rooms' }));
    expect(titles()).toEqual(['101', '102', '201']);
  });

  it('a sort toggle reorders the cards; pressing it again restores the number order', async () => {
    mockApp('admin', floors());
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });

    const attention = screen.getByRole('button', { name: 'Needs attention first' });
    await user.click(attention);
    expect(attention).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['201', '102', '101']);

    const oldest = screen.getByRole('button', { name: 'Recently cleaned last' });
    await user.click(oldest);
    expect(attention).toHaveAttribute('aria-pressed', 'false');
    expect(oldest).toHaveAttribute('aria-pressed', 'true');

    await user.click(oldest);
    expect(oldest).toHaveAttribute('aria-pressed', 'false');
    expect(titles()).toEqual(['101', '102', '201']);
  });

  it('hide-green hides an all-green room', async () => {
    mockApp('admin', floors());
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });

    await user.click(screen.getByRole('button', { name: 'Hide all-green rooms' }));
    expect(titles()).toEqual(['102', '201']);
  });

  it('remembers the view on this device', async () => {
    mockApp('admin', floors());
    const user = userEvent.setup();
    const { unmount } = await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });
    await user.click(within(levels()).getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Needs attention first' }));
    unmount();

    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '201' });
    expect(titles()).toEqual(['201']);
    expect(pressed('2')).toBe('true');
    expect(screen.getByRole('button', { name: 'Needs attention first' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('a stored level that no longer exists falls back to All', async () => {
    localStorage.setItem(
      'rooms.view',
      JSON.stringify({ level: '7', sort: 'number', hideGreen: false }),
    );
    mockApp('admin', floors());
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });
    expect(pressed('All rooms')).toBe('true');
    expect(titles()).toEqual(['101', '102', '201']);
  });

  it('"Show all" resets the level and hide-green when nothing matches', async () => {
    mockApp(
      'admin',
      rooms({ rooms: ['101', '102', '201'].map((number) => ({ id: `r${number}`, number })) }),
    );
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });

    await user.click(within(levels()).getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: 'Hide all-green rooms' }));
    expect(screen.getByText('No rooms match')).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(titles()).toEqual(['101', '102', '201']);
    expect(pressed('All rooms')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hide all-green rooms' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('no filter bar without rooms', async () => {
    mockApp('admin', rooms({ rooms: [] }));
    await renderApp();
    await screen.findByText('No rooms yet');
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull();
  });
});
