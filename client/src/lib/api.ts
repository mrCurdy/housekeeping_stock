import type { ApiErrorBody } from '@app/shared';
import type { Messages } from '@/i18n/en';

/** Fetch wrapper for the Express API: JSON in, JSON out, ApiError on failure. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(path: string, { body, headers, ...init }: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as Partial<ApiErrorBody>).error;
    throw new ApiError(
      res.status,
      err?.message ?? res.statusText,
      err?.code ?? 'ERROR',
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: Options) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = void>(path: string, opts?: Options) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/**
 * A plain-language message for a failed request, in the user's language. The server's own
 * messages are English, so known error codes are translated and only unknown ones pass through.
 */
export function apiErrorMessage(err: unknown, t: Messages): string {
  if (err instanceof ApiError) {
    if (err.code === 'BAD_REQUEST') return t.errors.badRequest;
    if (err.code === 'NOT_FOUND') return t.errors.notFound;
    if (err.status >= 500) return t.errors.server;
    return err.message;
  }
  if (err instanceof TypeError) return t.errors.offline;
  return err instanceof Error ? err.message : t.errors.generic;
}
