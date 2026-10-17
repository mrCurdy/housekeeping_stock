import { Router } from 'express';
import type { AppContext } from '../context';

export function systemRouter({ db, startedAt }: AppContext) {
  const r = Router();

  /** Liveness probe (used by the Docker healthcheck). */
  r.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: db.driver,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  return r;
}
