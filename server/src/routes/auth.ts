import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  type LinkInput,
  linkSchema,
  loginSchema,
  PIN_ROLES,
  type LoginInput,
  type PinChangeInput,
  pinChangeSchema,
} from '@app/shared';
import { allow, requireAuth } from '../auth/middleware';
import { hashPin, roleForPin, verifyPin } from '../auth/pins';
import { clearSessionCookie, hashToken, newToken, startSession } from '../auth/sessions';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { validateBody } from '../middleware/validate';

/**
 * POST /login { pin } (public, rate-limited) · GET /me · POST /logout ·
 * PUT /pins { role, pin } (admin) · POST /link { token } (public, the QR code's key) ·
 * GET/POST/DELETE /qr (admin).
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

  /** Opens a counter session from the QR code's token (wrong tokens count towards the limit). */
  r.post('/link', loginLimit, validateBody(linkSchema), async (req, res) => {
    const linkId = await db.auth.qrLinkId(hashToken((req.body as LinkInput).token));
    if (!linkId) throw HttpError.unauthorized('This QR code is no longer valid');
    if (req.sessionHash) await db.auth.deleteSession(req.sessionHash);
    await startSession(res, config, db, 'counter', linkId);
    res.json({ role: 'counter' });
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

  /** Whether a QR code exists (its token is only shown once, when it is made). */
  r.get('/qr', allow('qr'), async (_req, res) => {
    const link = await db.auth.qrLink();
    res.json(link ? { active: true, createdAt: link.createdAt } : { active: false });
  });

  /** Makes a new QR code; the old one and its counter sessions stop working. */
  r.post('/qr', allow('qr'), async (_req, res) => {
    const token = newToken();
    const { createdAt } = await db.auth.setQrLink(randomUUID(), hashToken(token));
    res.status(201).json({ token, createdAt });
  });

  /** Revokes the QR code and logs out its counter sessions. */
  r.delete('/qr', allow('qr'), async (_req, res) => {
    await db.auth.deleteQrLink();
    res.status(204).end();
  });

  return r;
}
