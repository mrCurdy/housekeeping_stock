import { Router } from 'express';
import {
  cleaningSchema,
  formatDate,
  todayLocal,
  idOrderSchema,
  roomCreateSchema,
  roomNameSchema,
  roomPatchSchema,
  roomStatusCreateSchema,
  roomStatusPatchSchema,
  unitStatusSchema,
  type CleaningInput,
  type IdOrderInput,
  type Room,
  type RoomCreateInput,
  type RoomNameInput,
  type RoomPatchInput,
  type RoomStatusCreateInput,
  type RoomStatusPatchInput,
  type UnitStatusInput,
} from '@app/shared';
import { allow } from '../auth/middleware';
import type { AppContext } from '../context';
import type { OrderedRepo } from '../db';
import { HttpError } from '../lib/errors';
import { found, param } from '../lib/params';
import { validateBody } from '../middleware/validate';

const notDuplicate = (room: Room | null | 'duplicate'): Room | null => {
  if (room === 'duplicate') throw HttpError.conflict('Another room has this number');
  return room;
};

const cleaning = allow('cleaning');
const setup = allow('setup');

/** POST / · PATCH /:id · DELETE /:id · PUT /order for a master list (room units, room types). */
function orderedRoutes<T>(r: Router, path: string, repo: OrderedRepo<T>, what: string) {
  r.post(path, setup, validateBody(roomNameSchema), async (req, res) => {
    res.status(201).json(await repo.create((req.body as RoomNameInput).name));
  });
  r.put(`${path}/order`, setup, validateBody(idOrderSchema), async (req, res) => {
    res.json(await repo.reorder((req.body as IdOrderInput).ids));
  });
  r.patch(`${path}/:id`, setup, validateBody(roomNameSchema), async (req, res) => {
    const { name, lang } = req.body as RoomNameInput;
    res.json(found(await repo.rename(param(req, 'id'), name, lang), what));
  });
  r.delete(`${path}/:id`, setup, async (req, res) => {
    found(await repo.delete(param(req, 'id')), what);
    res.status(204).end();
  });
}

/**
 * Room cards and their master setup (`setup`: admin); general cleanings (`cleaning`: admin and
 * housekeeper). Mounted at '/',
 * so every route carries its own guard.
 */
export function roomsRouter({ db }: AppContext) {
  const r = Router();

  // ---- Cards ----
  r.post('/rooms', setup, validateBody(roomCreateSchema), async (req, res) => {
    const room = notDuplicate(await db.rooms.create(req.body as RoomCreateInput));
    res.status(201).json(found(room, 'Room type'));
  });
  r.patch('/rooms/:id', setup, validateBody(roomPatchSchema), async (req, res) => {
    const room = await db.rooms.update(param(req, 'id'), req.body as RoomPatchInput);
    res.json(found(notDuplicate(room), 'Room or room type'));
  });
  r.delete('/rooms/:id', setup, async (req, res) => {
    found(await db.rooms.delete(param(req, 'id')), 'Room');
    res.status(204).end();
  });
  r.put('/rooms/:id/units/:unitId', setup, validateBody(unitStatusSchema), async (req, res) => {
    const input = req.body as UnitStatusInput;
    const set = await db.rooms.setUnitStatus(param(req, 'id'), param(req, 'unitId'), input);
    res.json(found(set, 'Room, unit or status'));
  });
  r.post('/rooms/:id/cleanings', cleaning, validateBody(cleaningSchema), async (req, res) => {
    const input = req.body as CleaningInput;
    // A cleaning can be registered for an earlier day (it sorts behind later ones), never ahead
    if (input.date > formatDate(todayLocal())) {
      throw HttpError.badRequest('A cleaning cannot be in the future');
    }
    const list = await db.rooms.addCleaning(param(req, 'id'), input);
    res.status(201).json(found(list, 'Room'));
  });

  // ---- Master setup ----
  orderedRoutes(r, '/room-units', db.roomUnits, 'Unit');
  orderedRoutes(r, '/room-types', db.roomTypes, 'Room type');

  r.post('/room-statuses', setup, validateBody(roomStatusCreateSchema), async (req, res) => {
    res.status(201).json(await db.roomStatuses.create(req.body as RoomStatusCreateInput));
  });
  r.put('/room-statuses/order', setup, validateBody(idOrderSchema), async (req, res) => {
    res.json(await db.roomStatuses.reorder((req.body as IdOrderInput).ids));
  });
  r.patch('/room-statuses/:id', setup, validateBody(roomStatusPatchSchema), async (req, res) => {
    const status = await db.roomStatuses.update(param(req, 'id'), req.body as RoomStatusPatchInput);
    res.json(found(status, 'Status'));
  });
  r.delete('/room-statuses/:id', setup, async (req, res) => {
    const done = await db.roomStatuses.delete(param(req, 'id'));
    if (done === 'last') throw HttpError.conflict('The last status cannot be deleted');
    found(done, 'Status');
    res.status(204).end();
  });

  return r;
}
