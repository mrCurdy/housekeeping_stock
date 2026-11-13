import { describe, expect, it } from 'vitest';
import {
  can,
  DEFAULT_ROLE_PERMISSIONS,
  linkSchema,
  loginSchema,
  PERMISSIONS,
  permissionsFor,
  type PermissionSettings,
  pinChangeSchema,
  pinSchema,
  ROLES,
  rolePermissionsSchema,
  STAFF_PERMISSIONS,
  todayOnly,
} from './auth';
import { backupSchema, normalizeStockData } from './schemas';

describe('can', () => {
  it('admin may do everything', () => {
    for (const p of PERMISSIONS) expect(can('admin', p)).toBe(true);
  });

  it('a housekeeper may register cleanings and count rooms only', () => {
    const allowed = PERMISSIONS.filter((p) => can('housekeeper', p));
    expect(allowed.sort()).toEqual(['cleaning', 'count']);
  });

  it('reception may keep the checklist only', () => {
    expect(PERMISSIONS.filter((p) => can('reception', p))).toEqual(['checklist']);
  });

  it('nobody but the admin does the daily stock work', () => {
    expect(ROLES.filter((r) => can(r, 'daily'))).toEqual(['admin']);
  });

  it('an unknown role (an old session) may do nothing', () => {
    for (const p of PERMISSIONS) expect(can('worker' as never, p)).toBe(false);
  });

  it('a QR counter session may only count', () => {
    expect(PERMISSIONS.filter((p) => can('counter', p))).toEqual(['count']);
  });

  it('nobody without a role', () => {
    for (const p of PERMISSIONS) expect(can(null, p)).toBe(false);
  });

  it('knows the four roles', () => {
    expect(ROLES).toEqual(['admin', 'housekeeper', 'reception', 'counter']);
  });
});

describe('todayOnly', () => {
  it('only the QR counter session is limited to today', () => {
    expect(todayOnly('counter')).toBe(true);
    expect(todayOnly('admin')).toBe(false);
    expect(todayOnly('housekeeper')).toBe(false);
    expect(todayOnly('reception')).toBe(false);
    expect(todayOnly(null)).toBe(false);
  });
});

describe('linkSchema', () => {
  it('needs a token', () => {
    expect(linkSchema.safeParse({ token: 'abc' }).success).toBe(true);
    expect(linkSchema.safeParse({ token: '' }).success).toBe(false);
    expect(linkSchema.safeParse({}).success).toBe(false);
  });
});

describe('pinSchema', () => {
  it.each(['0000', '1234', '9876'])('accepts %s', (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(true);
  });

  it.each(['123', '12345', 'abcd', '12 4', '', ' 1234', '١٢٣٤'])('rejects %j', (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });

  it('request schemas', () => {
    expect(loginSchema.safeParse({ pin: '1234' }).success).toBe(true);
    expect(loginSchema.safeParse({ pin: 1234 }).success).toBe(false);
    expect(pinChangeSchema.safeParse({ role: 'housekeeper', pin: '1111' }).success).toBe(true);
    expect(pinChangeSchema.safeParse({ role: 'reception', pin: '1111' }).success).toBe(true);
    expect(pinChangeSchema.safeParse({ role: 'worker', pin: '1111' }).success).toBe(false);
    expect(pinChangeSchema.safeParse({ role: 'counter', pin: '1111' }).success).toBe(false);
  });
});

describe('editable staff permissions', () => {
  it('the defaults are the fixed matrix', () => {
    expect(DEFAULT_ROLE_PERMISSIONS).toEqual({
      housekeeper: ['count', 'cleaning'],
      reception: ['checklist'],
    });
    expect(STAFF_PERMISSIONS).toEqual(['daily', 'checklist', 'count', 'cleaning']);
  });

  it('can() follows the overrides for the staff roles', () => {
    const settings: PermissionSettings = {
      rolePermissions: { housekeeper: ['count'], reception: ['daily'] },
    };
    expect(can('reception', 'daily', settings)).toBe(true);
    expect(can('reception', 'checklist', settings)).toBe(false);
    expect(can('housekeeper', 'cleaning', settings)).toBe(false);
    expect(can('housekeeper', 'count', settings)).toBe(true);
  });

  it('overrides never touch the admin, the QR counter or admin-only permissions', () => {
    const all = { housekeeper: [...STAFF_PERMISSIONS], reception: [] };
    const settings = { rolePermissions: all as never };
    expect(can('admin', 'daily', { rolePermissions: { housekeeper: [], reception: [] } })).toBe(
      true,
    );
    expect(can('counter', 'cleaning', settings)).toBe(false);
    expect(
      can('housekeeper', 'setup', { rolePermissions: { ...all, housekeeper: ['setup'] } as never }),
    ).toBe(false);
  });

  it('missing settings = the defaults', () => {
    expect(permissionsFor('housekeeper', {})).toEqual(['count', 'cleaning']);
    expect(permissionsFor('reception', undefined)).toEqual(['checklist']);
  });

  it('the schema takes only staff permissions and orders them', () => {
    expect(
      rolePermissionsSchema.parse({ housekeeper: ['cleaning', 'daily', 'daily'], reception: [] }),
    ).toEqual({
      housekeeper: ['daily', 'cleaning'],
      reception: [],
    });
    expect(rolePermissionsSchema.safeParse({ housekeeper: ['setup'], reception: [] }).success).toBe(
      false,
    );
    expect(rolePermissionsSchema.safeParse({ housekeeper: [] }).success).toBe(false);
  });
});

describe('rolePermissions in the stored data', () => {
  const base = { items: [], groups: [], locations: [], records: {}, groupRecords: {}, counts: {} };

  it('normalizeStockData keeps overrides and drops the defaults', () => {
    const perms = { housekeeper: ['daily' as const], reception: [] };
    expect(normalizeStockData({ ...base, settings: { rolePermissions: perms } }).settings).toEqual({
      rolePermissions: perms,
    });
    expect(
      normalizeStockData({
        ...base,
        settings: {
          rolePermissions: { housekeeper: ['cleaning', 'count'], reception: ['checklist'] },
        },
      }).settings,
    ).toEqual({});
  });

  it('a backup with a broken value loads with the defaults', () => {
    const parsed = backupSchema.parse({
      ...base,
      settings: { rolePermissions: { housekeeper: ['setup'] } },
    });
    expect(parsed.settings.rolePermissions).toBeUndefined();
  });
});
