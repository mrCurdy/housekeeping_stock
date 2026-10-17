import { describe, expect, it } from 'vitest';
import {
  editTask,
  isTaskOn,
  newTask,
  pruneTasks,
  removeTaskFrom,
  removeTaskIn,
  taskOn,
  tasksOn,
} from './checklist';
import { emptyStockData, type Task } from './types';

const old: Task = { id: 'a', name: 'Beds', description: '' };

describe('checklist history', () => {
  it('shows a task from the day it was added until the day it was removed', () => {
    const t = { ...newTask('b', 'Bins', '', '2026-10-10'), removed: '2026-10-15' };
    expect(
      ['2026-10-09', '2026-10-10', '2026-10-14', '2026-10-15'].map((d) => isTaskOn(t, d)),
    ).toEqual([false, true, true, false]);
    expect(isTaskOn(old, '2000-01-01')).toBe(true);
  });

  it('an edit applies from its day on; earlier days keep the old wording', () => {
    const t = editTask(old, '2026-10-17', { name: 'Make beds' });
    expect(t).toEqual({
      id: 'a',
      name: 'Make beds',
      description: '',
      earlier: [{ name: 'Beds', description: '', until: '2026-10-17' }],
    });
    expect(taskOn(t, '2026-10-16').name).toBe('Beds');
    expect(taskOn(t, '2026-10-17').name).toBe('Make beds');
  });

  it('a second edit on the same day replaces the first; one on an earlier day replaces later ones', () => {
    let t = editTask(old, '2026-10-17', { name: 'B1' });
    t = editTask(t, '2026-10-17', { description: 'Fold' });
    expect(t.earlier).toHaveLength(1);
    expect(taskOn(t, '2026-10-17')).toEqual({ id: 'a', name: 'B1', description: 'Fold' });
    t = editTask(t, '2026-10-20', { name: 'B2' });
    expect(t.earlier?.map((w) => w.until)).toEqual(['2026-10-17', '2026-10-20']);
    t = editTask(t, '2026-10-15', { name: 'B0' });
    expect(t).toMatchObject({ name: 'B0', earlier: [{ name: 'Beds', until: '2026-10-15' }] });
    // changing it back to the previous wording merges the two
    expect(editTask(t, '2026-10-15', { name: 'Beds' })).toEqual(old);
  });

  it('editing on the day it was added keeps no history', () => {
    const t = newTask('b', 'Bins', '', '2026-10-17');
    expect(editTask(t, '2026-10-17', { name: 'Trash' })).toEqual({ ...t, name: 'Trash' });
  });

  it('removing keeps the earlier days; removing on the day it was added deletes it', () => {
    const t = editTask(old, '2026-10-20', { name: 'Later' });
    expect(removeTaskFrom(t, '2026-10-17')).toEqual({ ...old, removed: '2026-10-17' });
    expect(removeTaskFrom(newTask('b', 'Bins', '', '2026-10-17'), '2026-10-17')).toBeNull();
  });

  it('removing drops the ticks from that day on only', () => {
    const data = emptyStockData();
    data.tasks = [old];
    data.checks = { '2026-10-16': { a: 't1' }, '2026-10-17': { a: 't2' } };
    expect(removeTaskIn(data, 'a', '2026-10-17')).toBe(true);
    expect(data.checks).toEqual({ '2026-10-16': { a: 't1' } });
    expect(tasksOn(data.tasks, '2026-10-16')).toEqual([{ id: 'a', name: 'Beds', description: '' }]);
    expect(tasksOn(data.tasks, '2026-10-17')).toEqual([]);
  });

  it('prunes history older than the oldest shown day', () => {
    const data = emptyStockData();
    let t = newTask('a', 'One', '', '2026-09-01');
    t = editTask(t, '2026-09-10', { name: 'Two' });
    t = editTask(t, '2026-10-10', { name: 'Three' });
    data.tasks = [t, { ...old, id: 'gone', removed: '2026-09-17' }];
    expect(pruneTasks(data, '2026-09-17')).toBe(true);
    expect(data.tasks).toEqual([
      {
        id: 'a',
        name: 'Three',
        description: '',
        earlier: [{ name: 'Two', description: '', until: '2026-10-10' }],
      },
    ]);
    expect(pruneTasks(data, '2026-09-17')).toBe(false);
  });
});
