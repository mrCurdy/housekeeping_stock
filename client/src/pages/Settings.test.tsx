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
  it('needs exactly 4 digits', async () => {
    const fetch = adminApi();
    settings();
    await fill(await screen.findByRole('form', { name: 'Worker PIN' }), '123', '123');
    expect(await screen.findByText('Use 4 digits')).toBeInTheDocument();
    expect(pinPuts(fetch)).toHaveLength(0);
  });

  it('needs the PIN typed twice the same', async () => {
    const fetch = adminApi();
    settings();
    await fill(await screen.findByRole('form', { name: 'Worker PIN' }), '1111', '2222');
    expect(await screen.findByText('The PINs do not match')).toBeInTheDocument();
    expect(pinPuts(fetch)).toHaveLength(0);
  });

  it('saves a new worker PIN and clears the form', async () => {
    const fetch = adminApi();
    settings();
    const form = await screen.findByRole('form', { name: 'Worker PIN' });
    await fill(form, '5678', '5678');
    expect(await screen.findByText('Worker PIN changed')).toBeInTheDocument();
    expect(JSON.parse(pinPuts(fetch)[0]?.[1]?.body as string)).toEqual({
      role: 'worker',
      pin: '5678',
    });
    expect(within(form).getByLabelText('New PIN')).toHaveValue('');
  });

  it('explains when the PIN is the same as the other role', async () => {
    adminApi(() => ({ status: 400, body: { error: { code: 'BAD_REQUEST', message: 'x' } } }));
    settings();
    await fill(await screen.findByRole('form', { name: 'Admin PIN' }), '0000', '0000');
    expect(
      await screen.findByText('The admin and worker PINs must be different'),
    ).toBeInTheDocument();
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

  function dataApi() {
    return mockApi((method, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') return { status: 200, body: stockFixture() };
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

  it('a file that is not a backup shows an error and sends nothing', async () => {
    const fetch = dataApi();
    settings();
    await pick('{"hello": 1}', 'notes.json');
    expect(await screen.findByText('Not a backup')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(restores(fetch)).toHaveLength(0);
  });
});
