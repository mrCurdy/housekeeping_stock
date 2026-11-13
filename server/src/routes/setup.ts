import { Router } from 'express';
import {
  cleanThresholds,
  itemPatchSchema,
  nameSchema,
  settingsPatchSchema,
  stockCardOrderSchema,
  type ItemPatchInput,
  type NameInput,
  type SettingsPatchInput,
  type StockCardOrderInput,
} from '@app/shared';
import type { AppContext } from '../context';
import type { NamedRepo } from '../db';
import { HttpError } from '../lib/errors';
import { found, param } from '../lib/params';
import { validateBody } from '../middleware/validate';

/** POST / { name } · PATCH /:id { name } · DELETE /:id for a list of named things. */
function namedRouter<T>(repo: NamedRepo<T>, what: string) {
  const r = Router();
  r.post('/', validateBody(nameSchema), async (req, res) => {
    const { name } = req.body as NameInput;
    res.status(201).json(await repo.create(name));
  });
  r.patch('/:id', validateBody(nameSchema), async (req, res) => {
    const { name } = req.body as NameInput;
    res.json(found(await repo.rename(param(req, 'id'), name), what));
  });
  r.delete('/:id', async (req, res) => {
    found(await repo.delete(param(req, 'id')), what);
    res.status(204).end();
  });
  return r;
}

/** The things you set up once: stock items, room groups (departures) and counting rooms. */
export function itemsRouter({ db }: AppContext) {
  const r = Router();
  r.post('/', validateBody(nameSchema), async (req, res) => {
    const { name } = req.body as NameInput;
    res.status(201).json(await db.items.create(name));
  });
  r.patch('/:id', validateBody(itemPatchSchema), async (req, res) => {
    res.json(found(await db.items.update(param(req, 'id'), req.body as ItemPatchInput), 'Item'));
  });
  r.delete('/:id', async (req, res) => {
    found(await db.items.delete(param(req, 'id')), 'Item');
    res.status(204).end();
  });
  return r;
}

export const groupsRouter = ({ db }: AppContext) => namedRouter(db.groups, 'Group');
export const locationsRouter = ({ db }: AppContext) => namedRouter(db.locations, 'Room');

/** PUT /order { order }: the order of the cards on the Stock page (the same for everyone). */
export function stockCardsRouter({ db }: AppContext) {
  const r = Router();
  r.put('/order', validateBody(stockCardOrderSchema), async (req, res) => {
    res.json(await db.stockCards.reorder((req.body as StockCardOrderInput).order));
  });
  return r;
}

/**
 * PATCH / { saluteText?, cleanGreenDays?, cleanYellowDays? }: app-wide preferences; returns all
 * settings. A single threshold is checked against the stored other one (400 unless green < yellow).
 */
export function settingsRouter({ db }: AppContext) {
  const r = Router();
  r.patch('/', validateBody(settingsPatchSchema), async (req, res) => {
    const patch = req.body as SettingsPatchInput;
    if ((patch.cleanGreenDays === undefined) !== (patch.cleanYellowDays === undefined)) {
      const stored = cleanThresholds((await db.snapshot()).settings);
      const green = patch.cleanGreenDays ?? stored.green;
      const yellow = patch.cleanYellowDays ?? stored.yellow;
      if (green >= yellow) throw HttpError.badRequest('Green days must be less than yellow days');
    }
    res.json(await db.settings.update(patch));
  });
  return r;
}
