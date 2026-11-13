import { act, render, screen, waitFor } from '@testing-library/react';
import { emptyStockData, type StockData } from '@app/shared';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { DateProvider } from '@/context/DateContext';
import { I18nProvider } from '@/context/I18nContext';
import { POLL_MS, StockProvider, useStock } from '@/context/StockContext';
import { ToastProvider } from '@/context/ToastContext';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DAY = '2026-11-13';

/** A dataset where item `a` has income `i` on DAY. */
const dataWithIncome = (i: number): StockData => {
  const d = emptyStockData();
  d.records = { a: { [DAY]: { i } } };
  return d;
};

type Reply = { status: number; body?: unknown };
type Handler = (method: string, path: string) => Reply | Promise<Reply> | undefined;

/**
 * Like `mockApi`, but a reply may be a promise, so a test can hold a request open.
 * `/auth/me` answers admin unless `route` says otherwise.
 */
function fakeApi(route: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = url.replace(/^\/api/, '');
    const reply =
      (await route(method, path)) ??
      (path === '/auth/me' ? { status: 200, body: { role: 'admin' } } : { status: 404 });
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const dataGets = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls.filter(([url, init]) => url === '/api/data' && (init?.method ?? 'GET') === 'GET')
    .length;

/** Shows item `a`'s income on DAY and offers buttons for the mutations under test. */
function Consumer() {
  const { data, loading, patchRecord, setCount } = useStock();
  const [countResult, setCountResult] = useState('');
  if (loading) return <p>loading</p>;
  return (
    <div>
      <output aria-label="income">{data.records.a?.[DAY]?.i ?? 'none'}</output>
      <button onClick={() => patchRecord('a', DAY, { i: 7 })}>set income</button>
      <button
        onClick={() =>
          setCount(DAY, 'room', 'a', 3).then(
            () => setCountResult('saved'),
            () => setCountResult('rethrown'),
          )
        }
      >
        count
      </button>
      <output aria-label="count result">{countResult}</output>
      <input aria-label="typing" />
    </div>
  );
}

const renderStock = () =>
  render(
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <DateProvider>
            <StockProvider>
              <Consumer />
            </StockProvider>
          </DateProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>,
  );

const income = () => screen.getByRole('status', { name: 'income' });
const click = (name: string) => act(() => screen.getByRole('button', { name }).click());

/** A promise the test resolves by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('StockContext', () => {
  it('(a) shows an optimistic edit before the request finishes', async () => {
    const patch = deferred<Reply>();
    fakeApi((method, path) => {
      if (path === '/data') return { status: 200, body: dataWithIncome(1) };
      if (method === 'PATCH' && path === `/records/a/${DAY}`) return patch.promise;
    });
    renderStock();
    await waitFor(() => expect(income()).toHaveTextContent('1'));

    await click('set income');
    expect(income()).toHaveTextContent('7');
    await act(async () => patch.resolve({ status: 204 }));
    expect(income()).toHaveTextContent('7');
  });

  it('(b) a failed request shows a toast and reloads the data', async () => {
    const fetch = fakeApi((method, path) => {
      if (path === '/data') return { status: 200, body: dataWithIncome(1) };
      if (method === 'PATCH')
        return { status: 500, body: { error: { code: 'X', message: 'boom' } } };
    });
    renderStock();
    await waitFor(() => expect(income()).toHaveTextContent('1'));
    expect(dataGets(fetch)).toBe(1);

    await click('set income');
    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    await waitFor(() => expect(dataGets(fetch)).toBe(2));
    // The reload brings back the server's value
    await waitFor(() => expect(income()).toHaveTextContent('1'));
  });

  it("(c) a poll that started before an edit doesn't overwrite it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const poll = deferred<Reply>();
    const state = { holdPolls: false };
    fakeApi((method, path) => {
      if (path === '/data') {
        if (!state.holdPolls) return { status: 200, body: dataWithIncome(1) };
        return poll.promise;
      }
      if (method === 'PATCH') return { status: 204 };
    });
    renderStock();
    await waitFor(() => expect(income()).toHaveTextContent('1'));

    // The poll starts, then the edit is made and saved while the poll is still running
    state.holdPolls = true;
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    await click('set income');
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(income()).toHaveTextContent('7');

    // The poll answers with the data from before the edit: it must not be applied
    await act(async () => poll.resolve({ status: 200, body: dataWithIncome(1) }));
    expect(income()).toHaveTextContent('7');
  });

  it('(d) no poll runs while an input has focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = fakeApi((_method, path) => {
      if (path === '/data') return { status: 200, body: dataWithIncome(1) };
    });
    renderStock();
    await waitFor(() => expect(income()).toHaveTextContent('1'));
    expect(dataGets(fetch)).toBe(1);

    act(() => screen.getByRole('textbox', { name: 'typing' }).focus());
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(dataGets(fetch)).toBe(1);

    // Once the input loses focus, the next tick polls again
    act(() => screen.getByRole('textbox', { name: 'typing' }).blur());
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(dataGets(fetch)).toBe(2);
  });

  it('(e) setCount rethrows on failure', async () => {
    fakeApi((method, path) => {
      if (path === '/data') return { status: 200, body: dataWithIncome(1) };
      if (method === 'PUT' && path.startsWith('/counts/')) {
        return { status: 500, body: { error: { code: 'X', message: 'boom' } } };
      }
    });
    renderStock();
    await waitFor(() => expect(income()).toHaveTextContent('1'));

    await click('count');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'count result' })).toHaveTextContent('rethrown'),
    );
    // The page shows its own error, so no toast
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
  });
});
