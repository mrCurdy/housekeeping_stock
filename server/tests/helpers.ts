import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { seedPins } from '../src/auth/pins';
import { loadConfig } from '../src/config';
import { createContext } from '../src/context';
import { createDb } from '../src/db';

/** The PINs a test database starts with (the defaults when ADMIN_PIN/WORKER_PIN are unset). */
export const ADMIN_PIN = '1234';
export const WORKER_PIN = '0000';

/**
 * A fresh app on an empty SQLite database in a temp dir. `before` runs first with the dir
 * (e.g. to put a db.json there to import); `extraEnv` adds environment variables.
 * `api()` is logged in as admin; `request()` has no session; `login(pin)` gives a new agent.
 */
export async function setup(before?: (dir: string) => void, extraEnv: NodeJS.ProcessEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stock-test-'));
  before?.(dir);
  const config = loadConfig({
    NODE_ENV: 'test',
    SQLITE_PATH: join(dir, 'stock.db'),
    JSON_DB_PATH: join(dir, 'db.json'),
    ...extraEnv,
  });
  const db = await createDb(config);
  await db.init();
  await seedPins(config, db);
  const app = createApp(createContext(config, db));

  /** A cookie-keeping client logged in with `pin` (expects the login to succeed). */
  const login = async (pin: string) => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin }).expect(200);
    return agent;
  };
  const admin = extraEnv.ADMIN_PIN ? null : await login(ADMIN_PIN);

  return {
    dir,
    db,
    api: () => {
      if (!admin) throw new Error('Custom ADMIN_PIN: use login() instead of api()');
      return admin;
    },
    request: () => request(app),
    login,
    async cleanup() {
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type TestEnv = Awaited<ReturnType<typeof setup>>;
