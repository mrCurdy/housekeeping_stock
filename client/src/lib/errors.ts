import { ApiError } from './api';

/** Maps zod validation details from the API into { field: message } for forms. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  return Object.fromEntries(
    (err.details as { path: string; message: string }[]).map((d) => [d.path, d.message]),
  );
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';
