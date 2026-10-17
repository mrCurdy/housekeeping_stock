import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  loginSchema,
  PIN_ROLES,
  type LoginInput,
  type PinChangeInput,
  pinChangeSchema,
} from '@app/shared';
import { allow, requireAuth } from '../auth/middleware';
import { hashPin, roleForPin, verifyPin } from '../auth/pins';
import { clearSessionCookie, startSession } from '../auth/sessions';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { validateBody } from '../middleware/validate';

/**
 * POST /login { pin } (public, rate-limited) · GET /me · POST /logout ·
 * PUT /pins { role, pin } (admin).
 */
export function authRouter({ config, db }: AppContext) {
  const r = Router();

  /** 10 wrong PINs per 15 minutes per IP; successful logins don't count. */
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: () => {
      throw HttpError.tooManyRequests('Too many wrong PINs. Try again in 15 minutes.');
    },
  });

  r.post('/login', loginLimit, validateBody(loginSchema), async (req, res) => {
    const role = await roleForPin(db, (req.body as LoginInput).pin);
    if (!role) throw HttpError.unauthorized('Wrong PIN');
    await startSession(res, config, db, role);
    res.json({ role });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ role: req.role });
  });

  r.post('/logout', async (req, res) => {
    if (req.sessionHash) await db.auth.deleteSession(req.sessionHash);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  /** Changes a PIN. Worker PIN: every worker is logged out. Admin PIN: the other admins are. */
  r.put('/pins', allow('pins'), validateBody(pinChangeSchema), async (req, res) => {
    const { role, pin } = req.body as PinChangeInput;
    const other = PIN_ROLES.find((r) => r !== role)!;
    const otherHash = (await db.auth.pinHashes())[other];
    if (otherHash && (await verifyPin(pin, otherHash))) {
      throw HttpError.badRequest('The admin and worker PINs must be different');
    }
    await db.auth.setPinHash(role, await hashPin(pin));
    await db.auth.deleteSessions(role, role === req.role ? req.sessionHash : undefined);
    res.status(204).end();
  });

  return r;
}
