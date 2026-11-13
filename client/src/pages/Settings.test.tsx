import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStockData } from '@app/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DateProvider } from '@/context/DateContext';
import { StockProvider } from '@/context/StockContext';
import { ToastProvider } from '@/context/ToastContext';
import { mockApi } from '@/test/fetch';
import Settings from './Settings';

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
