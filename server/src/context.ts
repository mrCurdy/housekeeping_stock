import type { Config } from './config';
import type { Db } from './db';

/** Everything routes need. Add shared services (mailer, realtime, …) here as the app grows. */
export interface AppContext {
  config: Config;
  db: Db;
  startedAt: number;
}

export function createContext(config: Config, db: Db): AppContext {
  return { config, db, startedAt: Date.now() };
}
