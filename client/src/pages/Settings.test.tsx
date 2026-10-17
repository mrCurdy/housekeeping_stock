import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { ToastProvider } from '@/context/ToastContext';
import { mockApi } from '@/test/fetch';
import Settings from './Settings';

afterEach(() => vi.unstubAllGlobals());

const settings = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Settings />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>,
  );

/** Fake API for an admin; `pins` answers `PUT /auth/pins`. */
function adminApi(pins: () => { status: number; body?: unknown } = () => ({ status: 204 })) {
  return mockApi((method, path) => {
    if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
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
