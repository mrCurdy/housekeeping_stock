import { describe, expect, it } from 'vitest';
import {
  can,
  linkSchema,
  loginSchema,
  PERMISSIONS,
  pinChangeSchema,
  pinSchema,
  ROLES,
  todayOnly,
} from './auth';

describe('can', () => {
  it('admin may do everything', () => {
    for (const p of PERMISSIONS) expect(can('admin', p)).toBe(true);
  });

  it('worker may do the daily work only', () => {
    const allowed = PERMISSIONS.filter((p) => can('worker', p));
    expect(allowed.sort()).toEqual(['checklist', 'count', 'daily']);
  });

  it('a QR counter session may only count', () => {
    expect(PERMISSIONS.filter((p) => can('counter', p))).toEqual(['count']);
  });

  it('nobody without a role', () => {
    for (const p of PERMISSIONS) expect(can(null, p)).toBe(false);
  });

  it('knows the three roles', () => {
    expect(ROLES).toEqual(['admin', 'worker', 'counter']);
  });
});

describe('todayOnly', () => {
  it('only the QR counter session is limited to today', () => {
    expect(todayOnly('counter')).toBe(true);
    expect(todayOnly('admin')).toBe(false);
    expect(todayOnly('worker')).toBe(false);
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
    expect(pinChangeSchema.safeParse({ role: 'worker', pin: '1111' }).success).toBe(true);
    expect(pinChangeSchema.safeParse({ role: 'counter', pin: '1111' }).success).toBe(false);
  });
});
