import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { hashPin } from '../src/auth/pins';
import { hashToken, SESSION_COOKIE } from '../src/auth/sessions';
import { migrations } from '../src/db/sqlite/migrations';
import { ADMIN_PIN, setup, type TestEnv } from './helpers';

/** A database as it was before the worker role was split: migrations 1–5, a `worker` PIN and session. */
function oldDb(dir: string, hashes: { admin: string; worker: string }, token: string) {
  const sql = new Database(join(dir, 'stock.db'));
  sql.exec(
    'CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  for (const m of migrations.filter((m) => m.id <= 5)) {
    sql.exec(m.sql);
    sql.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(m.id, m.name, 'then');
  }
  const pin = sql.prepare('INSERT INTO pins (role, hash) VALUES (?, ?)');
  pin.run('admin', hashes.admin);
  pin.run('worker', hashes.worker);
  sql
    .prepare('INSERT INTO sessions (token_hash, role, link_id, created_at) VALUES (?, ?, NULL, ?)')
    .run(hashToken(token), 'worker', 'then');
  sql.close();
}

const roleOf = async (env: TestEnv, pin: string) =>
  (await (await env.login(pin)).get('/api/auth/me').expect(200)).body.role;

describe('upgrading from the worker role', () => {
  it('the worker PIN and sessions become the housekeeper ones; reception gets a free PIN', async () => {
    const hashes = { admin: await hashPin(ADMIN_PIN), worker: await hashPin('0000') };
    const token = 'old-worker-session';
    const env = await setup((dir) => oldDb(dir, hashes, token));
    try {
      expect(Object.keys(await env.db.auth.pinHashes()).sort()).toEqual([
        'admin',
        'housekeeper',
        'reception',
      ]);
      // the old worker PIN 0000 is the housekeeper's now, so reception's default 0000 is taken
      expect(await roleOf(env, '0000')).toBe('housekeeper');
      expect(await roleOf(env, '1111')).toBe('reception');
      expect(await roleOf(env, ADMIN_PIN)).toBe('admin');
      // the old session keeps working, as a housekeeper
      const me = await env
        .request()
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${token}`)
        .expect(200);
      expect(me.body).toEqual({ role: 'housekeeper' });
    } finally {
      await env.cleanup();
    }
  });

  it('a reception PIN from env that is already taken also gets a free one', async () => {
    const hashes = { admin: await hashPin(ADMIN_PIN), worker: await hashPin('5555') };
    const env = await setup((dir) => oldDb(dir, hashes, 't'), { RECEPTION_PIN: '5555' });
    try {
      expect(await roleOf(env, '5555')).toBe('housekeeper');
      expect(await roleOf(env, '0000')).toBe('reception');
    } finally {
      await env.cleanup();
    }
  });
});
