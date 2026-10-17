import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import type { Role } from '@app/shared';
import type { Config } from '../config';
import type { Db } from '../db';

export const SESSION_COOKIE = 'sm_session';
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** Only the SHA-256 of a session token is stored, so a copy of the database can't log in. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const cookieOptions = (config: Config): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.httpsOnly,
  path: '/',
});

/** Starts a session for `role` and sets its cookie (kept for a year, until logout). */
export async function startSession(res: Response, config: Config, db: Db, role: Role) {
  const token = randomBytes(32).toString('base64url');
  await db.auth.createSession(hashToken(token), role);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res: Response, config: Config) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}
