import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { mockApi, unauthorized } from '@/test/fetch';
import { AuthProvider, useAuth } from './AuthContext';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function Inside() {
  const { role, can, logout } = useAuth();
  return (
    <div>
      <p>Role: {role}</p>
      {can('setup') && <p>Admin tools</p>}
      <button onClick={logout}>Log out</button>
    </div>
  );
}

const app = () =>
  render(
    <AuthProvider>
      <Inside />
    </AuthProvider>,
  );

describe('AuthContext', () => {
  it('shows the app for a session and hides what the role may not do', async () => {
    mockApi((_m, path) =>
      path === '/auth/me' ? { status: 200, body: { role: 'worker' } } : undefined,
    );
    app();
    expect(await screen.findByText('Role: worker')).toBeInTheDocument();
    expect(screen.queryByText('Admin tools')).not.toBeInTheDocument();
  });

  it('returns to the login screen when any request gets 401', async () => {
    let loggedIn = true;
    mockApi((_m, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (path === '/data') return loggedIn ? { status: 200, body: {} } : unauthorized;
    });
    app();
    expect(await screen.findByText('Admin tools')).toBeInTheDocument();
    loggedIn = false;
    await act(() => api.get('/data').catch(() => {}));
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });

  it('logs out', async () => {
    const fetch = mockApi((method, path) => {
      if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
      if (method === 'POST' && path === '/auth/logout') return { status: 204 };
    });
    app();
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('exchanges ?key= for a counter session and removes it from the URL', async () => {
    window.history.replaceState(null, '', '/counter?key=abc&x=1');
    let role: string | null = null;
    const fetch = mockApi((method, path, body) => {
      if (method === 'POST' && path === '/auth/link') {
        if ((body as { token: string }).token !== 'abc') return unauthorized;
        role = 'counter';
        return { status: 200, body: { role } };
      }
      if (path === '/auth/me') return role ? { status: 200, body: { role } } : unauthorized;
    });
    app();
    expect(await screen.findByText('Role: counter')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/link', expect.anything());
    expect(window.location.pathname + window.location.search).toBe('/counter?x=1');
  });

  it('shows the login screen with a message when the QR key is no longer valid', async () => {
    window.history.replaceState(null, '', '/counter?key=old');
    mockApi(() => unauthorized);
    app();
    expect(await screen.findByRole('alert')).toHaveTextContent(/QR code/);
    expect(window.location.search).toBe('');
  });
});
