import { Router } from 'express';
import {
  countSchema,
  formatDate,
  todayLocal,
  todayOnly,
  departuresSchema,
  recordPatchSchema,
  type CountInput,
  type DeparturesInput,
  type RecordPatchInput,
} from '@app/shared';
import { allow } from '../auth/middleware';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { dateParam, found, param } from '../lib/params';
import { validateBody } from '../middleware/validate';

/**
 * Day-by-day figures. Each call changes one value, so several people can enter data at once
 * without overwriting each other.
 */
export function dailyRouter({ db }: AppContext) {
  const r = Router();

  /** Income / manual consumption / manual stock for one item on one day. */
  r.patch(
    '/records/:itemId/:date',
    allow('daily'),
    validateBody(recordPatchSchema),
    async (req, res) => {
      const rec = await db.records.patch(
        param(req, 'itemId'),
        dateParam(req),
        req.body as RecordPatchInput,
      );
      res.json(found(rec, 'Item'));
    },
  );

  /** Departures of one group on one day. */
  r.put(
    '/departures/:groupId/:date',
    allow('daily'),
    validateBody(departuresSchema),
    async (req, res) => {
      const { d } = req.body as DeparturesInput;
      found(await db.departures.set(param(req, 'groupId'), dateParam(req), d), 'Group');
      res.json({ d });
    },
  );

  /**
   * One room count. Returns every count of that day, including what others counted meanwhile.
   * A QR (counter) session may only count today.
   */
  r.put(
    '/counts/:date/:locationId/:itemId',
    allow('count'),
    validateBody(countSchema),
    async (req, res) => {
      const { value } = req.body as CountInput;
      const date = dateParam(req);
      if (todayOnly(req.role) && date !== formatDate(todayLocal())) {
        throw HttpError.forbidden('This login can only count today');
      }
      const day = await db.counts.set(
        date,
        param(req, 'locationId'),
        param(req, 'itemId'),
        value,
      );
      res.json(found(day, 'Room or item'));
    },
  );

  return r;
}
