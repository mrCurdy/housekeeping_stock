import { z } from 'zod';

/**
 * `housekeeper` cleans and counts rooms, `reception` keeps the checklist (both log in with a PIN).
 * `counter` is a session opened from the admin's QR code: it may only count rooms today.
 */
export const ROLES = ['admin', 'housekeeper', 'reception', 'counter'] as const;
export type Role = (typeof ROLES)[number];

/** The roles that log in with a PIN (one PIN each). */
export const PIN_ROLES = ['admin', 'housekeeper', 'reception'] as const;
export type PinRole = (typeof PIN_ROLES)[number];

/**
 * setup: items, groups, locations, room cards (note, number, type, delete, unit statuses), adding
 * rooms and the room master layout · tasks: edit the checklist · restore · pins · qr ·
 * daily: departures, consumption, income, manual stock · checklist: ticks, notes · count: room counts ·
 * cleaning: register general cleanings
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
  'cleaning',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  housekeeper: ['cleaning', 'count'],
  reception: ['checklist'],
  counter: ['count'], // and only for today: see `todayOnly`
};

/** The single permission check, used by the server guards and to hide UI. */
export const can = (role: Role | null | undefined, perm: Permission): boolean =>
  !!role && (MATRIX[role]?.includes(perm) ?? false);

/** Roles that may only change today's data (the counts route checks it; the UI locks the date). */
export const todayOnly = (role: Role | null | undefined): boolean => role === 'counter';

export const pinSchema = z.string().regex(/^[0-9]{4}$/, 'Use 4 digits');

export const loginSchema = z.object({ pin: pinSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export const pinChangeSchema = z.object({ role: z.enum(PIN_ROLES), pin: pinSchema });
export type PinChangeInput = z.infer<typeof pinChangeSchema>;

/** The token from the QR code's `?key=`. */
export const linkSchema = z.object({ token: z.string().min(1).max(200) });
export type LinkInput = z.infer<typeof linkSchema>;
