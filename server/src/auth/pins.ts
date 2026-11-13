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

/** Which role a PIN belongs to (the PINs of the roles always differ), or null. */
export async function roleForPin(db: Db, pin: string): Promise<PinRole | null> {
  const hashes = await db.auth.pinHashes();
  for (const role of PIN_ROLES) {
    const hash = hashes[role];
    if (hash && (await verifyPin(pin, hash))) return role;
  }
  return null;
}

/** The role other than `except` whose PIN is `pin`, if any (a PIN change must not reuse one). */
export async function pinTakenBy(db: Db, pin: string, except?: PinRole) {
  const hashes = await db.auth.pinHashes();
  for (const role of PIN_ROLES) {
    const hash = hashes[role];
    if (role !== except && hash && (await verifyPin(pin, hash))) return role;
  }
  return null;
}

const DEFAULT_PINS: Record<PinRole, string> = {
  admin: '1234',
  housekeeper: '1111',
  reception: '0000',
};
/** Tried in order when a role's PIN is already another role's (e.g. reception on an upgraded hotel). */
const SPARE_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];

/**
 * Gives each role without a PIN one from ADMIN_PIN/HOUSEKEEPER_PIN/RECEPTION_PIN (or the default).
 * If that PIN is already another role's, the first free spare PIN is used (and logged), so the PINs
 * always differ. Run after db.init().
 */
export async function seedPins(
  config: Pick<Config, 'ADMIN_PIN' | 'HOUSEKEEPER_PIN' | 'RECEPTION_PIN'>,
  db: Db,
) {
  const hashes = await db.auth.pinHashes();
  const fromEnv: Record<PinRole, string | undefined> = {
    admin: config.ADMIN_PIN,
    housekeeper: config.HOUSEKEEPER_PIN,
    reception: config.RECEPTION_PIN,
  };
  for (const role of PIN_ROLES) {
    if (hashes[role]) continue;
    let pin = fromEnv[role] ?? DEFAULT_PINS[role];
    const taken = await pinTakenBy(db, pin);
    if (taken) {
      for (const spare of SPARE_PINS) {
        if (!(await pinTakenBy(db, spare))) {
          pin = spare;
          break;
        }
      }
      logger.warn(
        `The ${role} PIN would be the same as the ${taken} PIN: it is ${pin}. Change it in Settings.`,
      );
    } else if (!fromEnv[role]) {
      logger.warn(
        `${role.toUpperCase()}_PIN is not set: the ${role} PIN is ${pin}. Change it in Settings.`,
      );
    }
    await db.auth.setPinHash(role, await hashPin(pin));
  }
}
