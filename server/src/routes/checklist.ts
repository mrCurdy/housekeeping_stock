import { Router } from 'express';
import {
  checkSchema,
  nameSchema,
  taskGroupOrderSchema,
  noteSchema,
  taskCreateSchema,
  taskOrderSchema,
  taskPatchSchema,
  type CheckInput,
  type NameInput,
  type TaskGroupOrderInput,
  type NoteInput,
  type TaskCreateInput,
  type TaskOrderInput,
  type TaskPatchInput,
} from '@app/shared';
import { allow } from '../auth/middleware';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { dateParam, found, param } from '../lib/params';
import { validateBody } from '../middleware/validate';

/**
 * The daily checklist tasks: POST / · PUT /order · PATCH /:id · DELETE /:id/:date.
 * Changes apply from a day onwards (`from`, or :date), so earlier days keep their list.
 */
export function tasksRouter({ db }: AppContext) {
  const r = Router();
  r.post('/', validateBody(taskCreateSchema), async (req, res) => {
    const { name, description, from, group } = req.body as TaskCreateInput;
    res.status(201).json(await db.tasks.create(name, description, from, group));
  });
  r.put('/order', validateBody(taskOrderSchema), async (req, res) => {
    const { ids, move } = req.body as TaskOrderInput;
    res.json(await db.tasks.reorder(ids, move));
  });
  r.patch('/:id', validateBody(taskPatchSchema), async (req, res) => {
    res.json(found(await db.tasks.update(param(req, 'id'), req.body as TaskPatchInput), 'Task'));
  });
  r.delete('/:id/:date', async (req, res) => {
    found(await db.tasks.delete(param(req, 'id'), dateParam(req)), 'Task');
    res.status(204).end();
  });
  return r;
}

/**
 * The checklist's groups (cards): POST / · PUT /order · PATCH /:id · DELETE /:id.
 * Deleting moves the group's tasks to the group above; the last group can't be deleted (409).
 */
export function taskGroupsRouter({ db }: AppContext) {
  const r = Router();
  r.post('/', validateBody(nameSchema), async (req, res) => {
    res.status(201).json(await db.taskGroups.create((req.body as NameInput).name));
  });
  r.put('/order', validateBody(taskGroupOrderSchema), async (req, res) => {
    res.json(await db.taskGroups.reorder((req.body as TaskGroupOrderInput).ids));
  });
  r.patch('/:id', validateBody(nameSchema), async (req, res) => {
    const name = (req.body as NameInput).name;
    res.json(found(await db.taskGroups.rename(param(req, 'id'), name), 'Group'));
  });
  r.delete('/:id', async (req, res) => {
    const done = await db.taskGroups.delete(param(req, 'id'));
    if (done === 'last') throw HttpError.conflict('The last group cannot be deleted');
    found(done, 'Group');
    res.status(204).end();
  });
  return r;
}

/** What was done on a day, and the note left for the next shift. */
export function checklistRouter({ db }: AppContext) {
  const r = Router();

  /**
   * Ticks / unticks one task, or one checklist line of its instructions (`item`).
   * Returns every tick of that day, including other people's.
   */
  r.put(
    '/checks/:date/:taskId',
    allow('checklist'),
    validateBody(checkSchema),
    async (req, res) => {
      const { done, item } = req.body as CheckInput;
      const day = await db.checklist.setDone(dateParam(req), param(req, 'taskId'), done, item);
      res.json(found(day, 'Task'));
    },
  );

  r.put('/notes/:date', allow('checklist'), validateBody(noteSchema), async (req, res) => {
    const { text } = req.body as NoteInput;
    await db.checklist.setNote(dateParam(req), text);
    res.json({ text });
  });

  return r;
}
