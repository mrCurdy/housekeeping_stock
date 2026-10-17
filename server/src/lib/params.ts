import type { Request } from 'express';
import { dateSchema } from '@app/shared';
import { HttpError } from './errors';

/** A route param, as a string. */
export const param = (req: Request, name: string): string => String(req.params[name] ?? '');

/** A YYYY-MM-DD route param (400 otherwise). */
export const dateParam = (req: Request, name = 'date'): string => {
  const parsed = dateSchema.safeParse(param(req, name));
  if (!parsed.success) throw HttpError.badRequest(`Invalid date: ${param(req, name)}`);
  return parsed.data;
};

/** Throws 404 when a repository returned null/false for a missing row. */
export function found<T>(value: T | null | false, what: string): T {
  if (value === null || value === false) throw HttpError.notFound(`${what} not found`);
  return value;
}
