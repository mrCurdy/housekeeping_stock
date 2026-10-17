import type { RequestHandler } from 'express';
import { can, type Permission, type Role } from '@app/shared';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { hashToken, SESSION_COOKIE } from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `session` when the request has a valid session cookie. */
    role?: Role;
    /** SHA-256 of the session token (to log this session out). */
    sessionHash?: string;
  }
}

/** Reads the session cookie and sets `req.role`. Never rejects: see `requireAuth`. */
export const session =
  ({ db }: AppContext): RequestHandler =>
  async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) {
      const hash = hashToken(token);
      const role = await db.auth.sessionRole(hash);
      if (role) {
        req.role = role;
        req.sessionHash = hash;
      }
    }
    next();
  };

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.role) throw HttpError.unauthorized('Log in first');
  next();
};

/** 403 unless the logged-in role has `perm` (the matrix in shared/src/auth.ts). */
export const allow =
  (perm: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.role) throw HttpError.unauthorized('Log in first');
    if (!can(req.role, perm)) throw HttpError.forbidden('Not allowed for this login');
    next();
  };
