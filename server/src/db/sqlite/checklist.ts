import { isTaskOn, itemCheckKey } from '@app/shared';
import type { ChecklistRepo } from '../types';
import { type Ctx, createRows } from './rows';

export function createChecklist(ctx: Ctx): ChecklistRepo {
  const { run, write } = ctx;
  const { readTask, dayChecks } = createRows(ctx);
  return {
    async setDone(date, taskId, done, item) {
      return write(() => {
        const task = readTask(taskId);
        if (!task || !isTaskOn(task, date)) return null;
        const key = item ? itemCheckKey(taskId, item) : taskId;
        if (done) {
          run(
            'INSERT OR IGNORE INTO checks (date, task_id, at) VALUES (?, ?, ?)',
            date,
            key,
            new Date().toISOString(),
          );
        } else run('DELETE FROM checks WHERE date = ? AND task_id = ?', date, key);
        return dayChecks(date);
      });
    },
    async setNote(date, text) {
      write(() => {
        if (text.trim()) {
          run(
            'INSERT INTO notes (date, text) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET text = excluded.text',
            date,
            text,
          );
        } else run('DELETE FROM notes WHERE date = ?', date);
      });
    },
  };
}
