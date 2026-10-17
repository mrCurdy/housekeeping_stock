import type { Config } from '../config';
import type { Db } from './types';

export type * from './types';

/** Picks the storage driver from config. Drivers are imported lazily. */
export async function createDb(
  config: Pick<Config, 'DB_DRIVER' | 'JSON_DB_PATH' | 'BACKUP_DAYS'>,
): Promise<Db> {
  switch (config.DB_DRIVER) {
    case 'json': {
      const { createJsonDb } = await import('./json/index');
      return createJsonDb(config.JSON_DB_PATH, { backupDays: config.BACKUP_DAYS });
    }
  }
}
