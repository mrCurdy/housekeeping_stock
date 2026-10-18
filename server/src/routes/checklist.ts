import { Router } from 'express';
import {
  checkSchema,
  noteSchema,
  taskCreateSchema,
  taskOrderSchema,
  taskPatchSchema,
  type CheckInput,
  type NoteInput,
  type TaskCreateInput,
  type TaskOrderInput,
  type TaskPatchInput,
} from '@app/shared';
import { allow } from '../auth/middleware';
import type { AppContext } from '../context';
import { dateParam, found, param } from '../lib/params';
import { validateBody } from '../middleware/validate';

/**
 * The daily checklist tasks: POST / · PUT /order · PATCH /:id · DELETE /:id/:date.
 * Changes apply from a day onwards (`from`, or :date), so earlier days keep their list.
 */
export function tasksRouter({ db }: AppContext) {
  const r = Router();
  r.post('/', validateBody(taskCreateSchema), async (req, res) => {
    const { name, description, from } = req.body as TaskCreateInput;
    res.status(201).json(await db.tasks.create(name, description, from));
  });
  r.put('/order', validateBody(taskOrderSchema), async (req, res) => {
    res.json(await db.tasks.reorder((req.body as TaskOrderInput).ids));
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
