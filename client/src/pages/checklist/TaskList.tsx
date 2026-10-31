import { itemCheckKey, type DayTask } from '@app/shared';
import { ChevronDown, GripVertical, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import type { useListsDragSort } from '@/lib/useListsDragSort';
import { checkKeys } from './noteText';
import { TaskEditor } from './TaskEditor';
import { TaskNote } from './TaskNote';

/**
 * One group's tasks of the day: tick when done; tasks with instructions open like an accordion,
 * and their checklist lines are ticked per day too. The grip drags a task to another place, also
 * into another group's card (or ↑/↓ on it); ✎ opens a task in place (TaskEditor) to rename,
 * reorder or remove it from this day on.
 */
export function TaskList({
  group,
  tasks,
  list,
  sort,
  onAllDone,
}: {
  group: string;
  tasks: DayTask[];
  /** The group's place among the cards (its list in `sort`) */
  list: number;
  sort: ReturnType<typeof useListsDragSort>;
  /** The user ticked the group's last unticked task (not when a finished day is opened) */
  onAllDone: () => void;
}) {
  const { data, setDone } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.checklist;
  const canEdit = useAuth().can('tasks');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const ticks = data.checks[date] ?? {};
  const total = tasks.length;
  const done = tasks.filter((task) => ticks[task.id]).length;
  const canTick = useAuth().can('checklist');
  const dragging = (index: number) => sort.dragging?.list === list && sort.dragging.index === index;
  // The drop line while a task from another group is over this one
  const dropAt = sort.target?.list === list ? sort.target.index : null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <ul>
      {tasks.map((task, index) => {
        if (editing === task.id) {
          return (
            <li
              key={task.id}
              ref={sort.rowRef(list, index)}
              className="border-b border-border last:border-b-0"
            >
              <TaskEditor
                task={task}
                group={group}
                index={index}
                count={total}
                onClose={() => setEditing(null)}
              />
            </li>
          );
        }
        const tickedAt = ticks[task.id];
        const isOpen = open.has(task.id);
        const name = task.name || tx.unnamedTask;
        const checkId = `task-${task.id}`;
        const panelId = `task-info-${task.id}`;
        const lines = checkKeys(task.description);
        const linesDone = lines.filter((key) => ticks[itemCheckKey(task.id, key)]).length;
        const title = (
          <span className="flex flex-col">
            <span className={cn('font-medium', tickedAt && 'text-fg-muted line-through')}>
              {name}
              {lines.length > 0 && (
                <span
                  title={tx.linesDone(linesDone, lines.length)}
                  className={cn(
                    'ml-2 inline-block text-xs font-normal tabular-nums',
                    linesDone === lines.length ? 'text-success' : 'text-fg-muted',
                  )}
                >
                  {linesDone}/{lines.length}
                </span>
              )}
            </span>
            {tickedAt && <span className="text-xs text-success">{tx.doneAt(time(tickedAt))}</span>}
          </span>
        );
        return (
          <li
            key={task.id}
            ref={sort.rowRef(list, index)}
            style={sort.rowStyle(list, index)}
            className={cn(
              'relative border-b border-l-4 border-border bg-surface last:border-b-0',
              tickedAt ? 'border-l-success' : 'border-l-transparent',
              dragging(index) && 'rounded-md shadow-lg ring-1 ring-border',
            )}
          >
            {(dropAt === index || (dropAt === total && index === total - 1)) && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-primary',
                  dropAt === index ? '-top-px' : '-bottom-px',
                )}
              />
            )}
            <div className={cn('flex items-center gap-3 py-2 pr-5', canEdit ? 'pl-1' : 'pl-5')}>
              {canEdit && (
                <button
                  type="button"
                  title={tx.manage.dragTask}
                  aria-label={tx.manage.dragTaskNamed(name)}
                  data-task-grip={task.id}
                  className={cn(
                    'focus-ring -mr-2 flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted select-none hover:text-fg',
                    dragging(index) && 'cursor-grabbing',
                  )}
                  {...sort.handleProps(list, index)}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              )}
              <input
                id={checkId}
                type="checkbox"
                aria-label={name}
                checked={!!tickedAt}
                onChange={(e) => {
                  if (e.target.checked && !tickedAt && done === total - 1) onAllDone();
                  setDone(date, task.id, e.target.checked);
                }}
                className="focus-ring h-6 w-6 shrink-0 cursor-pointer rounded border-border accent-primary"
              />
              {task.description.trim() ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  title={isOpen ? tx.hideInstructions : tx.showInstructions}
                  onClick={() => toggle(task.id)}
                  className="focus-ring flex min-h-11 flex-1 items-center justify-between gap-3 rounded-md text-left"
                >
                  {title}
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 shrink-0 text-fg-muted transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
              ) : (
                <label
                  htmlFor={checkId}
                  className="flex min-h-11 flex-1 cursor-pointer items-center"
                >
                  {title}
                </label>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={tx.manage.editTask}
                  aria-label={tx.manage.editTaskNamed(name)}
                  className="shrink-0 text-fg-muted"
                  onClick={() => setEditing(task.id)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
            {isOpen && task.description.trim() && (
              <TaskNote
                id={panelId}
                taskId={task.id}
                text={task.description}
                ticks={ticks}
                onTick={
                  canTick ? (item, isDone) => setDone(date, task.id, isDone, item) : undefined
                }
                className={cn('animate-fade-in pr-5 pb-4', canEdit ? 'pl-[4.5rem]' : 'pl-14')}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
