import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Storage driver. Only 'json' for now; add a driver in db/index.ts and extend this enum. */
  DB_DRIVER: z.enum(['json']).default('json'),
  JSON_DB_PATH: z.string().default('../data/db.json'),
  /** Daily copies of the database file kept in backups/ next to it. 0 = off. */
  BACKUP_DAYS: z.coerce.number().int().min(0).default(30),

  /**
   * Site is served over HTTPS (directly or via a TLS-terminating proxy): enables HSTS and
   * upgrade-insecure-requests. Off by default because the tool is often used on a plain-http LAN.
   */
  HTTPS_ONLY: z.enum(['true', 'false']).default('false'),

  /** Directory with the built client; served in production. */
  CLIENT_DIST: z.string().optional(),
});

export type Config = z.infer<typeof envSchema> & { httpsOnly: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return { ...parsed.data, httpsOnly: parsed.data.HTTPS_ONLY === 'true' };
}
