import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { mockApi, unauthorized } from '@/test/fetch';

afterEach(() => vi.unstubAllGlobals());

const app = () =>
  render(
    <AuthProvider>
      <p>Inside the app</p>
    </AuthProvider>,
  );

describe('Login', () => {
  it('submits once 4 digits are entered on the keypad', async () => {
    const fetch = mockApi((method, path, body) => {
      if (path === '/auth/me') return unauthorized;
      if (method === 'POST' && path === '/auth/login') {
        return (body as { pin: string }).pin === '1234'
          ? { status: 200, body: { role: 'admin' } }
          : unauthorized;
      }
    });
    app();
    for (const d of ['1', '2', '3'])
      await userEvent.click(await screen.findByRole('button', { name: d }));
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: '4' }));
    expect(await screen.findByText('Inside the app')).toBeInTheDocument();
  });

  it('shows an error and clears the PIN when it is wrong; typing also works', async () => {
    mockApi((method, path) => {
      if (path === '/auth/me') return unauthorized;
      if (method === 'POST' && path === '/auth/login') return unauthorized;
    });
    app();
    const input = await screen.findByLabelText('PIN');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(input, '9999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
    expect(input).toHaveValue('');
    expect(screen.queryByText('Inside the app')).not.toBeInTheDocument();
  });

  it('waits for Log in when the whole PIN arrives at once (browser autofill)', async () => {
    const fetch = mockApi((method, path) => {
      if (path === '/auth/me') return unauthorized;
      if (method === 'POST' && path === '/auth/login')
        return { status: 200, body: { role: 'admin' } };
    });
    app();
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Inside the app')).toBeInTheDocument();
  });

  it('says so when there were too many wrong PINs', async () => {
    mockApi((method, path) => {
      if (path === '/auth/me') return unauthorized;
      if (path === '/auth/login') {
        return { status: 429, body: { error: { code: 'TOO_MANY_REQUESTS', message: 'x' } } };
      }
    });
    app();
    await userEvent.type(await screen.findByLabelText('PIN'), '1111');
    expect(await screen.findByRole('alert')).toHaveTextContent(/15 minutes/);
  });

  describe('focus', () => {
    const pointer = (coarse: boolean) =>
      vi.stubGlobal('matchMedia', (q: string) => ({
        matches: coarse && q === '(pointer: coarse)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    const api = () =>
      mockApi((method, path, body) => {
        if (path === '/auth/me') return unauthorized;
        if (method === 'POST' && path === '/auth/login') {
          return (body as { pin: string }).pin === '1234'
            ? { status: 200, body: { role: 'admin' } }
            : unauthorized;
        }
      });
    const press = async (pin: string) => {
      for (const d of pin) await userEvent.click(screen.getByRole('button', { name: d }));
    };

    it('on a touch screen leaves the field unfocused, so the OS keyboard stays shut', async () => {
      pointer(true);
      api();
      app();
      const input = await screen.findByLabelText('PIN');
      expect(input).not.toHaveFocus();
      await press('9999');
      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
      expect(input).not.toHaveFocus();
      await press('1234');
      expect(await screen.findByText('Inside the app')).toBeInTheDocument();
    });

    it('on a desktop focuses the field on open and after a wrong PIN', async () => {
      pointer(false);
      api();
      app();
      const input = await screen.findByLabelText('PIN');
      expect(input).toHaveFocus();
      await press('9999');
      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
      await waitFor(() => expect(input).toHaveFocus());
      await press('1234');
      expect(await screen.findByText('Inside the app')).toBeInTheDocument();
    });
  });
});
