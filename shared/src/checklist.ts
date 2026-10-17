import type { DayTask, StockData, Task, TaskWording } from './types';

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

/** A new task that is on the list from `from` onwards. */
export const newTask = (id: string, name: string, description: string, from: string): Task => ({
  id,
  name,
  description,
  added: from,
});

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
 * Removes the task from `from` onwards in `data` (its ticks from that day on go too).
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
    delete day[id];
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
