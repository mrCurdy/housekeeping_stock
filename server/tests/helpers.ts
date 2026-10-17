import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createContext } from '../src/context';
import { createDb } from '../src/db';

/** A fresh app on an empty database in a temp dir. */
export async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'stock-test-'));
  const config = loadConfig({ NODE_ENV: 'test', JSON_DB_PATH: join(dir, 'db.json') });
  const db = await createDb(config);
  await db.init();
  const app = createApp(createContext(config, db));

  return {
    dir,
    db,
    api: () => request(app),
    async cleanup() {
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type TestEnv = Awaited<ReturnType<typeof setup>>;
