import { randomUUID } from 'node:crypto';
import {
  editTask,
  emptyStockData,
  groupOf,
  newTask,
  removeTaskFrom,
  removeTaskGroupIn,
  type TaskGroup,
} from '@app/shared';
import type { TaskGroupRepo, TaskRepo } from '../types';
import { type Ctx, createRows, namedRepo } from './rows';

export function createTasks(ctx: Ctx): TaskRepo {
  const { run, prepare, write } = ctx;
  const { nextPos, readTasks, readTask, insertTask, updateTask, readTaskGroups } = createRows(ctx);
  return {
    async create(name, description, from, group) {
      return write(() => {
        // Stored explicitly (an unknown or missing group = the default one)
        const listed = groupOf({ group }, readTaskGroups());
        const task = newTask(randomUUID(), name, description, from, listed);
        insertTask(task, nextPos('tasks'));
        return task;
      });
    },
    async update(id, { from, ...patch }) {
      return write(() => {
        const old = readTask(id);
        if (!old) return null;
        const task = editTask(old, from, patch);
        updateTask(task);
        return task;
      });
    },
    async delete(id, from) {
      return write(() => {
        const old = readTask(id);
        if (!old) return false;
        const kept = removeTaskFrom(old, from);
        if (kept) updateTask(kept);
        else run('DELETE FROM tasks WHERE id = ?', id);
        // The task's tick and its lines' ticks (`<id>#<item>`)
        run(
          'DELETE FROM checks WHERE (task_id = ? OR substr(task_id, 1, ?) = ?) AND date >= ?',
          id,
          id.length + 1,
          `${id}#`,
          from,
        );
        return true;
      });
    },
    async reorder(ids, move) {
      return write(() => {
        const rank = new Map(ids.map((id, n) => [id, n]));
        const at = (id: string) => rank.get(id) ?? Infinity;
        const tasks = readTasks().sort((a, b) => at(a.id) - at(b.id)); // stable: unlisted keep order
        const task = move && tasks.find((t) => t.id === move.id);
        if (task && readTaskGroups().some((g) => g.id === move.group)) {
          task.group = move.group;
          updateTask(task);
        }
        const stmt = prepare('UPDATE tasks SET pos = ? WHERE id = ?');
        tasks.forEach((t, pos) => stmt.run(pos, t.id));
        return tasks;
      });
    },
  };
}

export function createTaskGroups(ctx: Ctx): TaskGroupRepo {
  const { write } = ctx;
  const { readTasks, updateTask, readTaskGroups, writeTaskGroups } = createRows(ctx);
  return {
    ...namedRepo<TaskGroup>(ctx, 'task_groups', () => {}),
    async delete(id) {
      return write(() => {
        const data = { ...emptyStockData(), tasks: readTasks(), taskGroups: readTaskGroups() };
        const done = removeTaskGroupIn(data, id);
        if (done !== true) return done;
        writeTaskGroups(data.taskGroups);
        data.tasks.forEach(updateTask);
        return true;
      });
    },
    async reorder(ids) {
      return write(() => {
        const rank = new Map(ids.map((id, n) => [id, n]));
        const at = (id: string) => rank.get(id) ?? Infinity;
        const groups = readTaskGroups().sort((a, b) => at(a.id) - at(b.id));
        writeTaskGroups(groups);
        return groups;
      });
    },
  };
}
