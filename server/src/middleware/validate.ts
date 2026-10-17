import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { HttpError } from '../lib/errors';

/** Validates and replaces `req.body` with the parsed (coerced, trimmed) value. */
export const validateBody =
  <S extends z.ZodType>(schema: S): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      throw HttpError.badRequest(
        'Validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    req.body = result.data;
    next();
  };
