import { vi } from 'vitest';

type Reply = { status: number; body?: unknown };
type Route = (method: string, path: string, body: unknown) => Reply | undefined;

/**
 * Replaces `fetch` with a fake API: `route` answers each `/api…` call (undefined = 404).
 * Returns the mock, so tests can check what was sent.
 */
export function mockApi(route: Route) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const reply = route(method, url.replace(/^\/api/, ''), body) ?? { status: 404 };
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const unauthorized = {
  status: 401,
  body: { error: { code: 'UNAUTHORIZED', message: 'x' } },
};
