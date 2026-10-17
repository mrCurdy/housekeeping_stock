import { Router } from 'express';
import { backupSchema, type StockData } from '@app/shared';
import { allow } from '../auth/middleware';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';

/** The whole dataset: read it, or replace it from a backup file. */
export function dataRouter({ db }: AppContext) {
  const r = Router();

  r.get('/data', async (_req, res) => {
    const data: StockData = await db.snapshot();
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  });

  /** Backup restore: replaces ALL data, room counts included. Accepts old-format backups too. */
  r.post('/restore', allow('restore'), async (req, res) => {
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) throw HttpError.badRequest('This file is not a Fomka backup');
    await db.replace(parsed.data);
    res.json(parsed.data);
  });

  return r;
}
