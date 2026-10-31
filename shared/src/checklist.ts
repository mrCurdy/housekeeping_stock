import {
  DEFAULT_TASK_GROUP_ID,
  type DayTask,
  type StockData,
  type Task,
  type TaskGroup,
  type TaskWording,
} from './types';

/**
 * The checklist history rules (pure). Adding, editing and removing a task apply from a given day
 * onwards; the days before it keep the list as it was, with their ticks.
 */

type Wording = Pick<Task, 'name' | 'description'>;
/** One wording and the first day it applies (undefined = from the start). */
type Span = Wording & { from: string | undefined };

/** Is the task on the list that day? */
export const isTaskOn = (task: Task, date: string): boolean =>
  (!task.added || date >= task.added) && (!task.removed || date < task.removed);

/** The task's name and instructions as they were on `date`. */
export function taskOn(task: Task, date: string): DayTask {
  const old = task.earlier?.find((w) => date < w.until);
  const { name, description } = old ?? task;
  return { id: task.id, name, description };
}

/** The tasks of one day, in list order, worded as they were that day. */
export const tasksOn = (tasks: Task[], date: string): DayTask[] =>
  tasks.filter((t) => isTaskOn(t, date)).map((t) => taskOn(t, date));

/**
 * The `checks` key of one checklist line inside a task's instructions (`item` is the line's key,
 * made by the client). Lines are ticked per day, like the tasks themselves.
 */
export const itemCheckKey = (taskId: string, item: string): string => `${taskId}#${item}`;

/** The task a `checks` key belongs to (the task's own tick, or one of its lines). */
export const checkTaskId = (key: string): string => key.split('#', 1)[0]!;

/** The checklist's groups: the stored ones, or the default group when there are none. */
export const taskGroupList = (groups: readonly TaskGroup[] | undefined): TaskGroup[] =>
  groups?.length ? [...groups] : [{ id: DEFAULT_TASK_GROUP_ID, name: '' }];

/**
 * The group a task is listed in: its own; without one (or a gone one) the default group, or the
 * first group once the default one is deleted. Not simply "the first": reordering the cards must
 * not move tasks.
 */
export function groupOf(task: Pick<Task, 'group'>, groups: readonly TaskGroup[] | undefined) {
  const list = taskGroupList(groups);
  const known = (id: string | undefined) => !!id && list.some((g) => g.id === id);
  if (known(task.group)) return task.group!;
  return known(DEFAULT_TASK_GROUP_ID) ? DEFAULT_TASK_GROUP_ID : list[0]!.id;
}

/** The tasks of one day per group, in group order (every group is listed, maybe empty). */
export function tasksByGroup(
  tasks: Task[],
  groups: readonly TaskGroup[] | undefined,
  date: string,
): { group: TaskGroup; tasks: DayTask[] }[] {
  const list = taskGroupList(groups);
  const out = list.map((group) => ({ group, tasks: [] as DayTask[] }));
  const at = new Map(list.map((g, i) => [g.id, i]));
  for (const t of tasks) {
    if (isTaskOn(t, date)) out[at.get(groupOf(t, list))!]!.tasks.push(taskOn(t, date));
  }
  return out;
}

/**
 * Moving task `id` into `group`, at place `to` among that group's tasks of `date` (tasks not on
 * that day's list stay put): the ids of all tasks in their new order, and the task's group.
 * Null when nothing moves.
 */
export function moveTaskTo(
  tasks: Task[],
  groups: readonly TaskGroup[] | undefined,
  id: string,
  group: string,
  to: number,
  date: string,
): { ids: string[]; group: string } | null {
  const task = tasks.find((t) => t.id === id);
  if (!task || !isTaskOn(task, date) || !taskGroupList(groups).some((g) => g.id === group)) {
    return null;
  }
  const inGroup = tasks.filter((t) => isTaskOn(t, date) && groupOf(t, groups) === group);
  const others = inGroup.filter((t) => t.id !== id).map((t) => t.id);
  if (to < 0 || to > others.length) return null;
  if (groupOf(task, groups) === group && inGroup.findIndex((t) => t.id === id) === to) return null;
  const ids = tasks.map((t) => t.id).filter((i) => i !== id);
  if (to < others.length) ids.splice(ids.indexOf(others[to]!), 0, id);
  else if (others.length) ids.splice(ids.indexOf(others[others.length - 1]!) + 1, 0, id);
  else ids.push(id);
  return { ids, group };
}

/** Applies a `moveTaskTo` result to `data`. */
export function applyTaskMove(data: StockData, id: string, move: { ids: string[]; group: string }) {
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const rank = new Map(move.ids.map((i, n) => [i, n]));
  const at = (i: string) => rank.get(i) ?? Infinity;
  data.tasks = [...byId.values()].sort((a, b) => at(a.id) - at(b.id));
  const task = byId.get(id);
  if (task) task.group = move.group;
}

/**
 * Deletes group `id` from `data`; its tasks move to the group above it (the next one when it is
 * the first). 'last' when it is the only group (never deleted), false when there is no such group.
 */
export function removeTaskGroupIn(data: StockData, id: string): boolean | 'last' {
  const list = taskGroupList(data.taskGroups);
  const i = list.findIndex((g) => g.id === id);
  if (i < 0) return false;
  if (list.length === 1) return 'last';
  const target = list[i === 0 ? 1 : i - 1]!.id;
  for (const t of data.tasks) if (groupOf(t, list) === id) t.group = target;
  data.taskGroups = list.filter((g) => g.id !== id);
  return true;
}

/** A new task that is on the list from `from` onwards. */
export const newTask = (
  id: string,
  name: string,
  description: string,
  from: string,
  group?: string,
): Task => ({ id, name, description, added: from, ...(group && { group }) });

const spans = (task: Task): Span[] => {
  const starts = [task.added, ...(task.earlier ?? []).map((w) => w.until)];
  const words: Wording[] = [...(task.earlier ?? []), task];
  return words.map(({ name, description }, i) => ({ name, description, from: starts[i] }));
};

/** Rebuilds the task from its spans (oldest first; the last one is the current wording). */
const withSpans = (task: Task, list: Span[]): Task => {
  const { earlier: _, ...rest } = task;
  const current = list[list.length - 1]!;
  const earlier: TaskWording[] = list.slice(0, -1).map((s, i) => ({
    name: s.name,
    description: s.description,
    until: list[i + 1]!.from!,
  }));
  return {
    ...rest,
    name: current.name,
    description: current.description,
    ...(earlier.length && { earlier }),
  };
};

/** The spans that started before `date`. */
const before = (task: Task, date: string) => spans(task).filter((s) => !s.from || s.from < date);

/**
 * The task renamed / re-described from `from` onwards (later changes are replaced too).
 * The days before `from` keep their wording.
 */
export function editTask(task: Task, from: string, patch: Partial<Wording>): Task {
  const next: Span = { ...taskOn(task, from), ...patch, from };
  const kept = before(task, from);
  const last = kept[kept.length - 1];
  if (last && last.name === next.name && last.description === next.description) {
    return withSpans(task, kept);
  }
  return withSpans(task, kept.length ? [...kept, next] : [{ ...next, from: task.added }]);
}

/**
 * The task taken off the list from `from` onwards, or null when it was never on the list
 * before that day (then it can be deleted outright).
 */
export function removeTaskFrom(task: Task, from: string): Task | null {
  if (task.added && task.added >= from) return null;
  const removed = task.removed && task.removed < from ? task.removed : from;
  return { ...withSpans(task, before(task, from)), removed };
}

/**
 * Removes the task from `from` onwards in `data` (its ticks, and its lines' ticks, from that day on
 * go too).
 * Returns false when there is no such task.
 */
export function removeTaskIn(data: StockData, id: string, from: string): boolean {
  const i = data.tasks.findIndex((t) => t.id === id);
  if (i < 0) return false;
  const kept = removeTaskFrom(data.tasks[i]!, from);
  if (kept) data.tasks[i] = kept;
  else data.tasks.splice(i, 1);
  for (const [date, day] of Object.entries(data.checks)) {
    if (date < from) continue;
    for (const key of Object.keys(day)) if (checkTaskId(key) === id) delete day[key];
    if (!Object.keys(day).length) delete data.checks[date];
  }
  return true;
}

/**
 * Forgets task history older than `minDate` (no page shows those days): tasks removed by then are
 * deleted, older wordings and `added` dates are dropped. Returns true if anything changed.
 */
export function pruneTasks(data: StockData, minDate: string): boolean {
  let changed = false;
  data.tasks = data.tasks.filter((t) => {
    const gone = !!t.removed && t.removed <= minDate;
    changed ||= gone;
    return !gone;
  });
  data.tasks = data.tasks.map((t) => {
    if (!(t.added && t.added <= minDate) && !t.earlier?.some((w) => w.until <= minDate)) return t;
    changed = true;
    const list = spans(t).filter((s, i, all) => !all[i + 1]?.from || all[i + 1]!.from! > minDate);
    const { added: _, ...rest } = withSpans(
      t,
      list.map((s, i) => (i ? s : { ...s, from: undefined })),
    );
    return rest;
  });
  return changed;
}
