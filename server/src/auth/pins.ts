import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PIN_ROLES, type PinRole } from '@app/shared';
import type { Config } from '../config';
import type { Db } from '../db';
import { logger } from '../lib/logger';

const scryptAsync = promisify(scrypt) as (
  pin: string,
  salt: Buffer,
  len: number,
) => Promise<Buffer>;
const KEY_LEN = 32;

/** `scrypt$<salt hex>$<key hex>` */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const [algo, salt, key] = hash.split('$');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Which role a PIN belongs to (the two PINs always differ), or null. */
export async function roleForPin(db: Db, pin: string): Promise<PinRole | null> {
  const hashes = await db.auth.pinHashes();
  for (const role of PIN_ROLES) {
    const hash = hashes[role];
    if (hash && (await verifyPin(pin, hash))) return role;
  }
  return null;
}

const DEFAULT_PINS: Record<PinRole, string> = { admin: '1234', worker: '0000' };

/** Gives each role without a PIN one from ADMIN_PIN/WORKER_PIN (or the default). Run after db.init(). */
export async function seedPins(config: Pick<Config, 'ADMIN_PIN' | 'WORKER_PIN'>, db: Db) {
  const hashes = await db.auth.pinHashes();
  const fromEnv: Record<PinRole, string | undefined> = {
    admin: config.ADMIN_PIN,
    worker: config.WORKER_PIN,
  };
  for (const role of PIN_ROLES) {
    if (hashes[role]) continue;
    const pin = fromEnv[role] ?? DEFAULT_PINS[role];
    if (!fromEnv[role]) {
      logger.warn(
        `${role.toUpperCase()}_PIN is not set: the ${role} PIN is ${pin}. Change it in Settings.`,
      );
    }
    await db.auth.setPinHash(role, await hashPin(pin));
  }
}
