export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
  }

  static badRequest = (msg = 'Bad request', details?: unknown) =>
    new HttpError(400, msg, 'BAD_REQUEST', details);
  static unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg, 'UNAUTHORIZED');
  static forbidden = (msg = 'Forbidden') => new HttpError(403, msg, 'FORBIDDEN');
  static notFound = (msg = 'Not found') => new HttpError(404, msg, 'NOT_FOUND');
  static conflict = (msg = 'Conflict') => new HttpError(409, msg, 'CONFLICT');
}
