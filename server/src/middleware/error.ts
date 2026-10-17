import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@app/shared';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req) => {
  throw HttpError.notFound(`Route not found: ${req.method} ${req.path}`);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = {
      error: { message: err.message, code: err.code, details: err.details },
    };
    res.status(err.status).json(body);
    return;
  }
  // Malformed JSON from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Invalid JSON body', code: 'BAD_REQUEST' } });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
};
