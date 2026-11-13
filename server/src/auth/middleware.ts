import type { RequestHandler } from 'express';
import { can, type AppSettings, type Permission, type Role } from '@app/shared';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { hashToken, SESSION_COOKIE } from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `session` when the request has a valid session cookie. */
    role?: Role;
    /** SHA-256 of the session token (to log this session out). */
    sessionHash?: string;
    /** The app settings read by `session`, so `allow` sees the admin's role permissions. */
    settings?: AppSettings;
  }
}

/**
 * Reads the session cookie and sets `req.role` (and `req.settings`, one read per request, so a
 * change to the role permissions counts from the next request). Never rejects: see `requireAuth`.
 */
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
        req.settings = await db.settings.read();
      }
    }
    next();
  };

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.role) throw HttpError.unauthorized('Log in first');
  next();
};

/** 403 unless the logged-in role has `perm` (shared/src/auth.ts, with the stored `rolePermissions`). */
export const allow =
  (perm: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.role) throw HttpError.unauthorized('Log in first');
    if (!can(req.role, perm, req.settings)) throw HttpError.forbidden('Not allowed for this login');
    next();
  };
