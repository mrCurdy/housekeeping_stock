import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { allow, requireAuth, session } from './auth/middleware';
import type { AppContext } from './context';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { checklistRouter, tasksRouter } from './routes/checklist';
import { dailyRouter } from './routes/daily';
import { dataRouter } from './routes/data';
import {
  groupsRouter,
  itemsRouter,
  locationsRouter,
  settingsRouter,
  stockCardsRouter,
} from './routes/setup';
import { systemRouter } from './routes/system';

export function createApp(ctx: AppContext) {
  const app = express();
  const { config } = ctx;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      hsts: config.httpsOnly,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: config.httpsOnly ? [] : null },
      },
    }),
  );
  app.use(cors({ origin: config.CLIENT_URL.split(',') }));
  // Backups of a few years of daily data stay well below this
  app.use(express.json({ limit: '20mb' }));
  app.use(cookieParser());
  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) =>
            req.url === '/api/health' || req.method === 'GET' || !req.url?.startsWith('/api'),
        },
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ status: res.statusCode }),
        },
      }),
    );
  }

  // ---- API ----
  // Guards: `allow(perm)` per router here, or per route inside routers mounted at '/'
  // (a guard on a '/' mount would also answer unknown routes with 403).
  const api = express.Router();
  api.use(session(ctx));
  api.use('/', systemRouter(ctx)); // public
  api.use('/auth', authRouter(ctx)); // login is public; the rest guard themselves
  api.use(requireAuth);
  api.use('/', dataRouter(ctx));
  api.use('/', dailyRouter(ctx));
  api.use('/items', allow('setup'), itemsRouter(ctx));
  api.use('/groups', allow('setup'), groupsRouter(ctx));
  api.use('/locations', allow('setup'), locationsRouter(ctx));
  api.use('/stock-cards', allow('setup'), stockCardsRouter(ctx));
  api.use('/settings', allow('setup'), settingsRouter(ctx));
  api.use('/tasks', allow('tasks'), tasksRouter(ctx));
  api.use('/', checklistRouter(ctx));
  // Register new feature routers here.
  api.use(notFoundHandler);
  app.use('/api', api);

  // ---- Static client (production) ----
  const clientDist = resolve(config.CLIENT_DIST ?? '../client/dist');
  if (config.NODE_ENV === 'production' && existsSync(clientDist)) {
    app.use(
      '/assets',
      express.static(resolve(clientDist, 'assets'), { maxAge: '1y', immutable: true }),
    );
    app.use(express.static(clientDist, { index: false }));
    // SPA fallback: every non-API GET returns index.html so client-side routing works.
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(clientDist, 'index.html'));
    });
    logger.info({ clientDist }, 'Serving client build');
  }

  app.use(errorHandler);
  return app;
}
