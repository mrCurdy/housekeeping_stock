import { createServer } from 'node:http';
import { createApp } from './app';
import { seedPins } from './auth/pins';
import { loadConfig } from './config';
import { createContext } from './context';
import { createDb } from './db';
import { logger } from './lib/logger';

async function main() {
  const config = loadConfig();
  const db = await createDb(config);
  await db.init();
  await seedPins(config, db);

  const app = createApp(createContext(config, db));
  const httpServer = createServer(app);

  httpServer.listen(config.PORT, () => {
    logger.info(
      `Server listening on http://localhost:${config.PORT} (db: ${db.driver}, env: ${config.NODE_ENV})`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    httpServer.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err instanceof Error ? err.message : err);
  process.exit(1);
});
