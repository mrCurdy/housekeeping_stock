import { z } from 'zod';
import { pinSchema } from '@app/shared';

// Empty (as docker compose passes an unset variable) means unset
const optionalPin = z.preprocess((v) => (v === '' ? undefined : v), pinSchema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** Storage driver. Only 'sqlite' for now; add a driver in db/index.ts and extend this enum. */
    DB_DRIVER: z.enum(['sqlite']).default('sqlite'),
    SQLITE_PATH: z.string().default('../data/stock.db'),
    /** The old JSON database: imported once into an empty SQLite database, then renamed *.imported. */
    JSON_DB_PATH: z.string().default('../data/db.json'),
    /** Daily JSON copies of the data kept in backups/ next to the database. 0 = off. */
    BACKUP_DAYS: z.coerce.number().int().min(0).default(30),

    /**
     * Site is served over HTTPS (directly or via a TLS-terminating proxy): enables HSTS and
     * upgrade-insecure-requests. Off by default because the tool is often used on a plain-http LAN.
     */
    HTTPS_ONLY: z.enum(['true', 'false']).default('false'),

    /**
     * PINs set on the first start (later changed in the app). Unset: admin 1234, housekeeper 1111,
     * reception 0000, with a warning. WORKER_PIN is the old name of HOUSEKEEPER_PIN.
     */
    ADMIN_PIN: optionalPin,
    HOUSEKEEPER_PIN: optionalPin,
    RECEPTION_PIN: optionalPin,
    WORKER_PIN: optionalPin,

    /** Directory with the built client; served in production. */
    CLIENT_DIST: z.string().optional(),
  })
  .transform(({ WORKER_PIN, ...e }) => ({ ...e, HOUSEKEEPER_PIN: e.HOUSEKEEPER_PIN ?? WORKER_PIN }))
  .refine(
    (e) => {
      const set = [e.ADMIN_PIN, e.HOUSEKEEPER_PIN, e.RECEPTION_PIN].filter(Boolean);
      return new Set(set).size === set.length;
    },
    {
      path: ['RECEPTION_PIN'],
      message: 'ADMIN_PIN, HOUSEKEEPER_PIN and RECEPTION_PIN must differ',
    },
  );

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
