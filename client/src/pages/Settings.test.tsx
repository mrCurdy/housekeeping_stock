import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStockData } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DateProvider } from '@/context/DateContext';
import { StockProvider } from '@/context/StockContext';
import { ToastProvider } from '@/context/ToastContext';
import { mockApi } from '@/test/fetch';
import { stockFixture } from '@/test/fixtures';
import Settings from './Settings';

const download = vi.hoisted(() => vi.fn());
vi.mock('@/lib/download', () => ({ downloadBlob: download }));

afterEach(() => vi.unstubAllGlobals());

const settings = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <DateProvider>
            <StockProvider>
              <Settings />
            </StockProvider>
          </DateProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>,
  );

/** Fake API for an admin; `pins` answers `PUT /auth/pins`. */
function adminApi(pins: () => { status: number; body?: unknown } = () => ({ status: 204 })) {
  return mockApi((method, path) => {
    if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
    if (path === '/data') return { status: 200, body: { ...emptyStockData(), settings: {} } };
    if (path === '/auth/qr' && method === 'GET') return { status: 200, body: { active: false } };
    if (path === '/auth/qr' && method === 'POST') {
      return { status: 201, body: { token: 'tok', createdAt: '2026-10-17T08:00:00.000Z' } };
    }
    if (path === '/auth/pins' && method === 'PUT') return pins();
    if (path === '/settings' && method === 'PATCH') return { status: 200, body: {} };
  });
}

async function fill(form: HTMLElement, pin: string, repeat: string) {
  const f = within(form);
  await userEvent.type(f.getByLabelText('New PIN'), pin);
  await userEvent.type(f.getByLabelText('Repeat the new PIN'), repeat);
  await userEvent.click(f.getByRole('button', { name: 'Save' }));
}

const pinPuts = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls.filter(([url, init]) => url === '/api/auth/pins' && init?.method === 'PUT');

describe('Settings: PINs', () => {
  it('has a PIN form for each role', async () => {
    adminApi();
    settings();
    for (const name of ['Admin PIN', 'Housekeeper PIN', 'Reception PIN']) {
      expect(await screen.findByRole('form', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByText('Every reception device will be logged out and needs the new PIN.'),
    ).toBeInTheDocument();
  });

  it('needs exactly 4 digits', async () => {
    const fetch = adminApi();
    settings();
    await fill(await screen.findByRole('form', { name: 'Housekeeper PIN' }), '123', '123');
    expect(await screen.findByText('Use 4 digits')).toBeInTheDocument();
    expect(pinPuts(fetch)).toHaveLength(0);
  });

  it('needs the PIN typed twice the same', async () => {
    const fetch = adminApi();
    settings();
    await fill(await screen.findByRole('form', { name: 'Housekeeper PIN' }), '1111', '2222');
    expect(await screen.findByText('The PINs do not match')).toBeInTheDocument();
    expect(pinPuts(fetch)).toHaveLength(0);
  });

  it('saves a new reception PIN and clears the form', async () => {
    const fetch = adminApi();
    settings();
    const form = await screen.findByRole('form', { name: 'Reception PIN' });
    await fill(form, '5678', '5678');
    expect(await screen.findByText('Reception PIN changed')).toBeInTheDocument();
    expect(JSON.parse(pinPuts(fetch)[0]?.[1]?.body as string)).toEqual({
      role: 'reception',
      pin: '5678',
    });
    expect(within(form).getByLabelText('New PIN')).toHaveValue('');
  });

  it('explains when another role has the PIN', async () => {
    adminApi(() => ({ status: 400, body: { error: { code: 'BAD_REQUEST', message: 'x' } } }));
    settings();
    await fill(await screen.findByRole('form', { name: 'Admin PIN' }), '0000', '0000');
    expect(await screen.findByText('Another role already has this PIN')).toBeInTheDocument();
  });
});

describe('Settings: QR code', () => {
  it('makes a QR code and shows it once', async () => {
    const fetch = adminApi();
    settings();
    await userEvent.click(await screen.findByRole('button', { name: 'Make QR code' }));
    expect(await screen.findByRole('img', { name: 'QR code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/qr', expect.objectContaining({ method: 'POST' }));
  });
});

describe('Settings: fireworks', () => {
  it('saves the fireworks text', async () => {
    const fetch = adminApi();
    settings();
    const input = await screen.findByLabelText('Fireworks text');
    expect(input).toHaveAttribute('placeholder', 'Tubli!');
    await userEvent.type(input, 'Hurraa!{Enter}');
    expect(fetch).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ saluteText: 'Hurraa!' }) }),
    );
  });
});

describe('Settings: room cards setup', () => {
  /** Admin API that also answers the room setup routes; `data` overrides the dataset. */
  function roomsApi(data: Partial<ReturnType<typeof emptyStockData>> = {}) {
    return mockApi((method, path, body) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') {
        return { status: 200, body: { ...emptyStockData(), settings: {}, ...data } };
      }
      if (path === '/auth/qr') return { status: 200, body: { active: false } };
      if (path === '/room-units' && method === 'POST') {
        return { status: 201, body: { id: 'u1', ...(body as object) } };
      }
      if (method === 'PATCH') return { status: 204 };
    });
  }
  const sent = (fetch: ReturnType<typeof mockApi>, url: string, method: string) =>
    fetch.mock.calls
      .filter(([u, init]) => u === url && init?.method === method)
      .map(([, init]) => JSON.parse(init?.body as string));

  it('adds a unit', async () => {
    const fetch = roomsApi();
    settings();
    await userEvent.type(await screen.findByPlaceholderText('New unit (bed, shower…)'), 'Bed');
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    expect(await screen.findByLabelText('Unit name Bed')).toHaveValue('Bed');
    expect(sent(fetch, '/api/room-units', 'POST')).toEqual([{ name: 'Bed' }]);
  });

  it('renames a status and changes its colour', async () => {
    const fetch = roomsApi();
    settings();
    const name = await screen.findByLabelText('Status name OK');
    await userEvent.clear(name);
    await userEvent.type(name, 'Fine{Enter}');
    expect(sent(fetch, '/api/room-statuses/ok', 'PATCH')).toEqual([{ name: 'Fine' }]);
    await userEvent.selectOptions(screen.getByLabelText('Colour of Fine'), 'Blue');
    expect(sent(fetch, '/api/room-statuses/ok', 'PATCH')).toEqual([
      { name: 'Fine' },
      { color: 'blue' },
    ]);
  });

  it('saves the cleaning thresholds', async () => {
    const fetch = roomsApi();
    settings();
    const green = await screen.findByLabelText('Green up to (days)');
    expect(green).toHaveValue(15);
    await userEvent.clear(green);
    await userEvent.type(green, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(sent(fetch, '/api/settings', 'PATCH')).toEqual([
      { cleanGreenDays: 10, cleanYellowDays: 29 },
    ]);
  });

  it('does not save green ≥ yellow', async () => {
    const fetch = roomsApi({ settings: { cleanGreenDays: 5, cleanYellowDays: 9 } });
    settings();
    // The form remounts once the stored pair loads
    await waitFor(() => expect(screen.getByLabelText('Green up to (days)')).toHaveValue(5));
    const green = screen.getByLabelText('Green up to (days)');
    await userEvent.clear(green);
    await userEvent.type(green, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(await screen.findByText('Green must be less than yellow')).toBeInTheDocument();
    expect(sent(fetch, '/api/settings', 'PATCH')).toEqual([]);
  });
});

describe('Settings: add a room', () => {
  beforeEach(() => {
    // jsdom has no <dialog> methods
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  function roomApi() {
    return mockApi((method, path, body) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') {
        return {
          status: 200,
          body: {
            ...emptyStockData(),
            settings: {},
            rooms: [{ id: 'r10', number: '10' }],
            roomTypes: [{ id: 'dbl', name: 'Double' }],
          },
        };
      }
      if (path === '/auth/qr') return { status: 200, body: { active: false } };
      if (path === '/rooms' && method === 'POST') {
        return { status: 201, body: { id: 'r101', ...(body as object) } };
      }
    });
  }
  const posts = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls
      .filter(([u, init]) => u === '/api/rooms' && init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string));
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Add room' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New room' })).toBeInTheDocument();
    return dialog;
  };

  it('Add sends the number, type and note', async () => {
    const fetch = roomApi();
    settings();
    const dialog = within(await open());
    await userEvent.type(dialog.getByLabelText('Room number'), ' 101 ');
    await userEvent.selectOptions(dialog.getByLabelText('Room type'), 'dbl');
    await userEvent.type(dialog.getByLabelText('Note'), 'Sea view');
    await userEvent.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(posts(fetch)).toEqual([{ number: '101', type: 'dbl', note: 'Sea view' }]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Cancel sends nothing', async () => {
    const fetch = roomApi();
    settings();
    const dialog = within(await open());
    await userEvent.type(dialog.getByLabelText('Room number'), '101');
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts(fetch)).toEqual([]);
  });

  it('a taken number shows the error in the dialog', async () => {
    const fetch = roomApi();
    settings();
    const dialog = within(await open());
    await userEvent.type(dialog.getByLabelText('Room number'), '10');
    await userEvent.click(dialog.getByRole('button', { name: 'Add' }));
    expect(dialog.getByText('Room 10 already exists')).toBeInTheDocument();
    expect(posts(fetch)).toEqual([]);
  });
});

describe('Settings: data and backups', () => {
  beforeEach(() => {
    download.mockReset();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  function dataApi(data = stockFixture()) {
    return mockApi((method, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') return { status: 200, body: data };
      if (path === '/auth/qr') return { status: 200, body: { active: false } };
      if (path === '/restore' && method === 'POST') return { status: 200, body: stockFixture() };
    });
  }
  const restores = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls.filter(([u, init]) => u === '/api/restore' && init?.method === 'POST');
  const pick = async (content: string, name: string) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    const input = screen.getByTestId('restore-file');
    await userEvent.upload(input, new File([content], name, { type: 'application/json' }));
  };

  it('shows Excel, Backup and Restore', async () => {
    dataApi();
    settings();
    expect(await screen.findByRole('heading', { name: 'Data and backups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('Backup downloads a JSON file', async () => {
    dataApi();
    settings();
    await waitFor(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Backup' }));
      expect(download).toHaveBeenCalled();
    });
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/^stock_backup_\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await blob.text()).items).toHaveLength(2);
  });

  it('Restore with a backup file asks, then sends it', async () => {
    const fetch = dataApi();
    settings();
    await pick(JSON.stringify(stockFixture()), 'old.json');
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/old\.json/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restores(fetch)).toHaveLength(1));
    expect(await screen.findByText('Backup restored')).toBeInTheDocument();
  });

  it('Backup works for a hotel that only has rooms', async () => {
    dataApi({ ...emptyStockData(), rooms: [{ id: 'r1', number: '101' }] });
    settings();
    await waitFor(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Backup' }));
      expect(download).toHaveBeenCalled();
    });
    const [blob] = download.mock.calls[0] as [Blob, string];
    expect(JSON.parse(await blob.text()).rooms).toEqual([{ id: 'r1', number: '101' }]);
  });

  it('Excel with rooms but no items downloads a workbook', async () => {
    dataApi({ ...emptyStockData(), rooms: [{ id: 'r1', number: '101' }] });
    settings();
    await waitFor(
      async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Excel' }));
        expect(download).toHaveBeenCalled();
      },
      { timeout: 10_000 },
    );
    expect(download.mock.calls[0]?.[1]).toMatch(/\.xlsx$/);
  }, 15_000);

  it('Backup with nothing at all says there is no data', async () => {
    dataApi(emptyStockData());
    settings();
    await userEvent.click(await screen.findByRole('button', { name: 'Backup' }));
    expect(await screen.findByText('No data to back up yet')).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });

  it("Restore's confirmation names the room cards and cleanings", async () => {
    dataApi();
    settings();
    const backup = stockFixture({
      rooms: [
        { id: 'r1', number: '101' },
        { id: 'r2', number: '102' },
      ],
      cleanings: { r1: [{ date: '2026-11-01', by: 'Ann' }] },
    });
    await pick(JSON.stringify(backup), 'rooms.json');
    const dialog = within(await screen.findByRole('dialog'));
    const text = dialog.getByText(/rooms\.json/).textContent;
    expect(text).toContain('2 items');
    expect(text).toContain('2 room cards (1 with cleanings)');
    expect(text).not.toContain('departure group');
    expect(text).toContain('including counts, room statuses and cleanings');
  });

  it('a file that is not a backup shows an error and sends nothing', async () => {
    const fetch = dataApi();
    settings();
    await pick('{"hello": 1}', 'notes.json');
    expect(await screen.findByText('Not a backup')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(restores(fetch)).toHaveLength(0);
  });
});

describe('Settings: room list', () => {
  beforeEach(() => {
    // jsdom has no <dialog> methods
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  function roomApi(
    rooms = [
      { id: 'r201', number: '201' },
      { id: 'r10', number: '10', type: 'dbl' },
      { id: 'r102', number: '102' },
    ],
  ) {
    return mockApi((method, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') {
        return {
          status: 200,
          body: {
            ...emptyStockData(),
            settings: {},
            rooms,
            roomTypes: [
              { id: 'dbl', name: 'Double' },
              { id: 'sgl', name: 'Single' },
            ],
          },
        };
      }
      if (path === '/auth/qr') return { status: 200, body: { active: false } };
      if (path.startsWith('/rooms/') && (method === 'PATCH' || method === 'DELETE')) {
        return { status: 204 };
      }
    });
  }
  const calls = (fetch: ReturnType<typeof mockApi>, method: string) =>
    fetch.mock.calls
      .filter(([u, init]) => String(u).startsWith('/api/rooms/') && init?.method === method)
      .map(([u, init]) => [u, init?.body ? JSON.parse(init.body as string) : undefined]);
  const list = async () => within(await screen.findByRole('list', { name: 'Rooms' }));
  const edit = async (number: string) => {
    await userEvent.click((await list()).getByRole('button', { name: `Edit room ${number}` }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: `Edit room ${number}` }),
    ).toBeInTheDocument();
    return within(dialog);
  };

  it('lists the rooms in level order with their type', async () => {
    roomApi();
    settings();
    const items = (await list()).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['10Double', '102', '201']);
  });

  it('says so when there are no rooms', async () => {
    roomApi([]);
    settings();
    expect(await screen.findByText('No rooms yet.')).toBeInTheDocument();
  });

  it('Edit sends only the changed fields', async () => {
    const fetch = roomApi();
    settings();
    const dialog = await edit('10');
    expect(dialog.getByLabelText('Room number')).toHaveValue('10');
    await userEvent.clear(dialog.getByLabelText('Room number'));
    await userEvent.type(dialog.getByLabelText('Room number'), '11');
    await userEvent.selectOptions(dialog.getByLabelText('Room type'), 'sgl');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls(fetch, 'PATCH')).toEqual([['/api/rooms/r10', { number: '11', type: 'sgl' }]]),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clearing the type sends an empty type', async () => {
    const fetch = roomApi();
    settings();
    const dialog = await edit('10');
    await userEvent.selectOptions(dialog.getByLabelText('Room type'), '');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(fetch, 'PATCH')).toEqual([['/api/rooms/r10', { type: '' }]]));
  });

  it('a number taken by another room shows the error and sends nothing', async () => {
    const fetch = roomApi();
    settings();
    const dialog = await edit('10');
    await userEvent.clear(dialog.getByLabelText('Room number'));
    await userEvent.type(dialog.getByLabelText('Room number'), '102');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    expect(dialog.getByText('Room 102 already exists')).toBeInTheDocument();
    expect(calls(fetch, 'PATCH')).toEqual([]);
  });

  it('keeping its own number is allowed', async () => {
    const fetch = roomApi();
    settings();
    const dialog = await edit('10');
    await userEvent.type(dialog.getByLabelText('Note'), 'Sea view');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls(fetch, 'PATCH')).toEqual([['/api/rooms/r10', { note: 'Sea view' }]]),
    );
  });

  it('Remove asks, then deletes', async () => {
    const fetch = roomApi();
    settings();
    await userEvent.click((await list()).getByRole('button', { name: 'Delete room 102' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Delete room 102?')).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls(fetch, 'DELETE')).toEqual([['/api/rooms/r102', undefined]]));
    expect((await list()).queryByText('102')).toBeNull();
  });

  it('cancelling Remove sends nothing', async () => {
    const fetch = roomApi();
    settings();
    await userEvent.click((await list()).getByRole('button', { name: 'Delete room 102' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(calls(fetch, 'DELETE')).toEqual([]);
  });
});

describe('Settings: roles', () => {
  const patches = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls
      .filter(([url, init]) => url === '/api/settings' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

  it('shows the defaults and saves a change for both roles', async () => {
    const fetch = adminApi();
    settings();
    const daily = await screen.findByRole('checkbox', { name: 'Daily stock: Reception' });
    expect(daily).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Checklist: Reception' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'General cleaning: Housekeeper' })).toBeChecked();
    await userEvent.click(daily);
    expect(daily).toBeChecked();
    expect(patches(fetch)).toEqual([
      {
        rolePermissions: {
          housekeeper: ['count', 'cleaning'],
          reception: ['daily', 'checklist'],
        },
      },
    ]);
  });

  it('Reset to defaults sends the defaults', async () => {
    const fetch = adminApi();
    settings();
    const reset = await screen.findByRole('button', { name: 'Reset to defaults' });
    expect(reset).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Inventory count: Housekeeper' }));
    await userEvent.click(reset);
    expect(patches(fetch).at(-1)).toEqual({
      rolePermissions: { housekeeper: ['count', 'cleaning'], reception: ['checklist'] },
    });
    expect(screen.getByRole('checkbox', { name: 'Inventory count: Housekeeper' })).toBeChecked();
  });
});
