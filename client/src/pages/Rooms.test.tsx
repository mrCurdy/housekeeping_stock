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
  Element.prototype.scrollTo ??= () => {}; // a worker is redirected to the Stock overview
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

  it('has no add-room form (rooms are added in Settings)', async () => {
    mockApp('admin', rooms());
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '2' });
    expect(screen.queryByRole('button', { name: 'Add room' })).toBeNull();
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
    const fetch = mockApp('admin', rooms(), (method, path) =>
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

  it('without rooms the admin is pointed to Settings', async () => {
    mockApp('admin', rooms({ rooms: [] }));
    await renderApp();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
    expect(screen.getByText('Add the rooms in Settings.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
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
    mockApp('admin', floors());
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

  it('the attention toggle reorders the cards; pressing it again restores the number order', async () => {
    mockApp('admin', floors());
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });

    const attention = screen.getByRole('button', { name: 'Needs attention first' });
    await user.click(attention);
    expect(attention).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['201', '102', '101']);

    expect(screen.queryByRole('button', { name: 'Recently cleaned last' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recently cleaned first' })).toBeNull();

    await user.click(attention);
    expect(attention).toHaveAttribute('aria-pressed', 'false');
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

  it('no filter bar or search without rooms', async () => {
    mockApp('admin', rooms({ rooms: [] }));
    await renderApp();
    await screen.findByText('No rooms yet');
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search rooms' })).toBeNull();
  });
});

describe('rooms search', () => {
  /** 101, 103, 301, 315 (Double), 205 (Double). */
  const hotel = () =>
    rooms({
      rooms: [
        { id: 'r101', number: '101' },
        { id: 'r103', number: '103' },
        { id: 'r301', number: '301' },
        { id: 'r315', number: '315', type: 'dbl' },
        { id: 'r205', number: '205', type: 'dbl' },
      ],
    });
  const search = () => screen.getByRole('textbox', { name: 'Search rooms' });
  const start = async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });
    return user;
  };

  it('a number matches from its first digit', async () => {
    const user = await start();
    expect(search()).toHaveAttribute('placeholder', 'Room number or type');
    await user.type(search(), '3');
    expect(titles()).toEqual(['301', '315']);
    await user.type(search(), '0');
    expect(titles()).toEqual(['301']);
  });

  it('a room type name matches, any case', async () => {
    const user = await start();
    await user.type(search(), 'DOU');
    expect(titles()).toEqual(['205', '315']);
  });

  it('searches every level; the level applies again once cleared with ×', async () => {
    const user = await start();
    const levels = screen.getByRole('group', { name: 'Level' });
    await user.click(within(levels).getByRole('button', { name: '2' }));
    expect(titles()).toEqual(['205']);

    await user.type(search(), '1');
    expect(titles()).toEqual(['101', '103']);
    expect(within(levels).getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search()).toHaveValue('');
    expect(titles()).toEqual(['205']);
  });

  it('is not remembered', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    const { unmount } = await renderApp();
    await user.type(await screen.findByRole('textbox', { name: 'Search rooms' }), '3');
    unmount();
    await renderApp();
    await screen.findByRole('heading', { level: 3, name: '101' });
    expect(search()).toHaveValue('');
    expect(titles()).toHaveLength(5);
  });

  it('"Show all" also clears the search', async () => {
    const user = await start();
    await user.type(search(), '9');
    expect(screen.getByText('No rooms match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(search()).toHaveValue('');
    expect(titles()).toHaveLength(5);
  });
});

describe('rooms compact tiles', () => {
  const hotel = () =>
    rooms({
      unitStatus: { r2: { shower: { status: 'fix', by: 'Ann', at: '2026-11-01T10:00:00.000Z' } } },
      cleanings: { r10: [{ date: daysAgo(0), by: 'Bob' }] },
    });
  const view = () => screen.getByRole('group', { name: 'View' });
  const tile = (number: string) => screen.getByRole('button', { name: `Open room ${number}` });
  const toCompact = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByRole('heading', { level: 3, name: '2' });
    await user.click(within(view()).getByRole('button', { name: 'Compact tiles' }));
  };

  it('the toggle switches between full cards and tiles', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await toCompact(user);
    expect(within(view()).getByRole('button', { name: 'Compact tiles' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('article')).toBeNull();
    expect(tile('10')).toBeInTheDocument();
    expect(tile('2')).toBeInTheDocument();

    await user.click(within(view()).getByRole('button', { name: 'Full cards' }));
    expect(screen.queryByRole('button', { name: 'Open room 2' })).toBeNull();
    expect(card('2')).toBeInTheDocument();
  });

  it('a tile shows the number, type and what its icons mean', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await toCompact(user);

    const two = tile('2');
    expect(within(two).getByText('2')).toBeInTheDocument();
    expect(within(two).getByText('Double')).toBeInTheDocument();
    expect(within(two).getByRole('img', { name: 'Units: Needs fixing' })).toHaveClass(
      'text-status-red',
    );
    expect(within(two).getByRole('img', { name: 'No general cleaning yet' })).toHaveClass(
      'text-status-red',
    );
    const ten = tile('10');
    expect(within(ten).getByRole('img', { name: 'Units: OK' })).toHaveClass('text-status-green');
    expect(within(ten).getByRole('img', { name: 'Cleaned today · Bob' })).toHaveClass(
      'text-status-green',
    );
  });

  it('no units → no wrench', async () => {
    mockApp('admin', { ...hotel(), roomUnits: [] });
    const user = userEvent.setup();
    await renderApp();
    await toCompact(user);
    expect(within(tile('2')).getAllByRole('img')).toHaveLength(1);
  });

  it('one tile opens as a full card at a time; × turns it back into a tile', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    await renderApp();
    await toCompact(user);

    await user.click(tile('2'));
    expect(card('2')).toHaveClass('col-span-full');
    expect(card('2')).toHaveClass('sm:max-w-xl');
    expect(tile('10')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    await user.click(tile('10'));
    expect(card('10')).toBeInTheDocument();
    expect(tile('2')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    await user.click(within(card('10')).getByRole('button', { name: 'Close room 10' }));
    expect(screen.queryByRole('article')).toBeNull();
    expect(tile('10')).toBeInTheDocument();
  });

  it('remembers the mode on this device', async () => {
    mockApp('admin', hotel());
    const user = userEvent.setup();
    const { unmount } = await renderApp();
    await toCompact(user);
    unmount();
    await renderApp();
    expect(await screen.findByRole('button', { name: 'Open room 2' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });
});

// Last: the App's router is created once per file and keeps the /stock it was redirected to.
describe('rooms page for a worker', () => {
  it('a worker opening /rooms is redirected, and has no Rooms NAV entry', async () => {
    mockApp('worker', rooms());
    await renderApp();
    await waitFor(() => expect(window.location.pathname).toBe('/stock'));
    expect(screen.queryByRole('link', { name: 'Rooms' })).toBeNull();
  });
});
