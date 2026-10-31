import { describe, expect, it } from 'vitest';
import {
  applyTaskMove,
  editTask,
  groupOf,
  isTaskOn,
  itemCheckKey,
  moveTaskTo,
  newTask,
  pruneTasks,
  removeTaskFrom,
  removeTaskGroupIn,
  removeTaskIn,
  taskGroupList,
  taskOn,
  tasksByGroup,
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
    data.checks = {
      '2026-10-16': { a: 't1' },
      '2026-10-17': { a: 't2', [itemCheckKey('a', 'x1')]: 't3', b: 't4' },
    };
    expect(removeTaskIn(data, 'a', '2026-10-17')).toBe(true);
    expect(data.checks).toEqual({ '2026-10-16': { a: 't1' }, '2026-10-17': { b: 't4' } });
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

  it('moves a task to a place among the tasks of the day; hidden tasks stay put', () => {
    const tasks: Task[] = [
      { ...old, id: 'a' },
      { ...old, id: 'gone', removed: '2026-10-01' },
      { ...old, id: 'b' },
      { ...old, id: 'c' },
    ];
    const day = '2026-10-17';
    const move = (id: string, to: number) => moveTaskTo(tasks, [], id, 'default', to, day)?.ids;
    expect(move('c', 0)).toEqual(['c', 'a', 'gone', 'b']);
    expect(move('a', 2)).toEqual(['gone', 'b', 'c', 'a']);
    expect(move('a', 1)).toEqual(['gone', 'b', 'a', 'c']);
    expect(move('a', 0)).toBeUndefined();
    expect(move('a', 3)).toBeUndefined();
    expect(move('gone', 0)).toBeUndefined();
  });
});

describe('checklist groups', () => {
  const groups = [
    { id: 'g1', name: 'Before 11' },
    { id: 'g2', name: 'Service' },
  ];
  const tasks: Task[] = [
    { ...old, id: 'a' }, // no group: the first one
    { ...old, id: 'b', group: 'g2' },
    { ...old, id: 'c', group: 'gone' }, // unknown group: the first one
    { ...old, id: 'd', group: 'g2' },
  ];
  const day = '2026-10-17';

  it('lists the default group when there are none, and tasks by group', () => {
    expect(taskGroupList([])).toEqual([{ id: 'default', name: '' }]);
    expect(groupOf(tasks[2]!, groups)).toBe('g1');
    // Without a group: the default one wherever it is, not the first
    const withDefault = [...groups, { id: 'default', name: '' }];
    expect(groupOf(tasks[0]!, withDefault)).toBe('default');
    expect(
      tasksByGroup(tasks, groups, day).map((g) => [g.group.id, g.tasks.map((t) => t.id)]),
    ).toEqual([
      ['g1', ['a', 'c']],
      ['g2', ['b', 'd']],
    ]);
  });

  it('moves a task into another group at a place', () => {
    expect(moveTaskTo(tasks, groups, 'a', 'g2', 1, day)).toEqual({
      ids: ['b', 'c', 'a', 'd'],
      group: 'g2',
    });
    expect(moveTaskTo(tasks, groups, 'b', 'g1', 2, day)).toEqual({
      ids: ['a', 'c', 'b', 'd'],
      group: 'g1',
    });
    expect(moveTaskTo(tasks, groups, 'a', 'nope', 0, day)).toBeNull();
    expect(moveTaskTo(tasks, groups, 'a', 'g2', 3, day)).toBeNull();
    // Into an empty group
    const three = [...groups, { id: 'g3', name: '' }];
    expect(moveTaskTo(tasks, three, 'a', 'g3', 0, day)).toEqual({
      ids: ['b', 'c', 'd', 'a'],
      group: 'g3',
    });

    const data = { ...emptyStockData(), tasks: structuredClone(tasks), taskGroups: groups };
    applyTaskMove(data, 'a', moveTaskTo(data.tasks, groups, 'a', 'g2', 2, day)!);
    expect(data.tasks.map((t) => [t.id, groupOf(t, groups)])).toEqual([
      ['b', 'g2'],
      ['c', 'g1'],
      ['d', 'g2'],
      ['a', 'g2'],
    ]);
  });

  it('removing a group moves its tasks to the one above (or below); the last one stays', () => {
    const data = {
      ...emptyStockData(),
      tasks: structuredClone(tasks),
      taskGroups: [...groups, { id: 'g3', name: 'Evening' }],
    };
    data.tasks.push({ ...old, id: 'e', group: 'g3' });
    expect(removeTaskGroupIn(data, 'g3')).toBe(true);
    expect(data.tasks.find((t) => t.id === 'e')!.group).toBe('g2');
    expect(removeTaskGroupIn(data, 'g1')).toBe(true);
    expect(data.tasks.map((t) => t.group)).toEqual(['g2', 'g2', 'g2', 'g2', 'g2']);
    expect(removeTaskGroupIn(data, 'g2')).toBe('last');
    expect(removeTaskGroupIn(data, 'nope')).toBe(false);
    expect(data.taskGroups).toEqual([{ id: 'g2', name: 'Service' }]);
  });
});
