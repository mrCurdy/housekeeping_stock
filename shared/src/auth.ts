import { z } from 'zod';

/** `counter` is a session opened from the admin's QR code: it may only count rooms today. */
export const ROLES = ['admin', 'worker', 'counter'] as const;
export type Role = (typeof ROLES)[number];

/** The roles that log in with a PIN (one PIN each). */
export const PIN_ROLES = ['admin', 'worker'] as const;
export type PinRole = (typeof PIN_ROLES)[number];

/**
 * setup: items, groups, rooms · tasks: edit the checklist · restore · pins · qr ·
 * daily: departures, consumption, income, manual stock · checklist: ticks, notes · count: room counts
 */
export const PERMISSIONS = [
  'setup',
  'tasks',
  'restore',
  'pins',
  'qr',
  'daily',
  'checklist',
  'count',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  worker: ['daily', 'checklist', 'count'],
  counter: ['count'], // and only for today (checked by the counts route)
};

/** The single permission check, used by the server guards and to hide UI. */
export const can = (role: Role | null | undefined, perm: Permission): boolean =>
  !!role && MATRIX[role].includes(perm);

export const pinSchema = z.string().regex(/^[0-9]{4}$/, 'Use 4 digits');

export const loginSchema = z.object({ pin: pinSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export const pinChangeSchema = z.object({ role: z.enum(PIN_ROLES), pin: pinSchema });
export type PinChangeInput = z.infer<typeof pinChangeSchema>;
