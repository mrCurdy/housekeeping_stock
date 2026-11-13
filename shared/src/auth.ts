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

/** The roles whose permissions the admin can change in Settings (`rolePermissions`). */
export const STAFF_ROLES = ['housekeeper', 'reception'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The permissions the admin can give or take from a staff role; the others stay admin-only. */
export const STAFF_PERMISSIONS = ['daily', 'checklist', 'count', 'cleaning'] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export type RolePermissions = Record<StaffRole, StaffPermission[]>;

/** What the staff roles may do until the admin changes it. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<RolePermissions> = {
  housekeeper: ['count', 'cleaning'],
  reception: ['checklist'],
};

/** A staff permission list, without repeats, in `STAFF_PERMISSIONS` order. */
const staffList = z
  .array(z.enum(STAFF_PERMISSIONS))
  .max(20)
  .transform((list) => STAFF_PERMISSIONS.filter((p) => list.includes(p)));

/** `AppSettings.rolePermissions`: only staff permissions, for both staff roles. */
export const rolePermissionsSchema = z.object({ housekeeper: staffList, reception: staffList });

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((p, i) => p === b[i]);

/** true when `perms` equals the defaults (then nothing is stored). */
export const isDefaultRolePermissions = (perms: RolePermissions): boolean =>
  STAFF_ROLES.every((r) => sameList(perms[r], DEFAULT_ROLE_PERMISSIONS[r]));

const FIXED: Record<'admin' | 'counter', readonly Permission[]> = {
  admin: PERMISSIONS,
  counter: ['count'], // and only for today: see `todayOnly`
};

/** The settings `can` reads (the stored `AppSettings` fit). */
export interface PermissionSettings {
  rolePermissions?: RolePermissions;
}

const isStaff = (role: Role): role is StaffRole =>
  (STAFF_ROLES as readonly string[]).includes(role);

/** What `role` may do: the admin and the QR counter are fixed, the staff roles come from the settings (else the defaults). */
export function permissionsFor(
  role: Role,
  settings?: PermissionSettings | null,
): readonly Permission[] {
  if (isStaff(role)) {
    const list = settings?.rolePermissions?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role];
    return list.filter((p) => (STAFF_PERMISSIONS as readonly string[]).includes(p));
  }
  return FIXED[role] ?? [];
}

/**
 * The single permission check, used by the server guards and to hide UI. Pass the app settings
 * so the admin's changes to the staff roles count (without them: the defaults).
 */
export const can = (
  role: Role | null | undefined,
  perm: Permission,
  settings?: PermissionSettings | null,
): boolean => !!role && permissionsFor(role, settings).includes(perm);

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
