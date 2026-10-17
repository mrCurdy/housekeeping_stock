import { tasksOn } from '@app/shared';
import { ChevronDown, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { TaskEditor } from './TaskEditor';

/**
 * The day's tasks: tick when done; tasks with instructions open like an accordion.
 * ✎ opens a task in place (TaskEditor) to rename, reorder or remove it from this day on.
 */
export function TaskList() {
  const { data, setDone } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.checklist;
  const canEdit = useAuth().can('tasks');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const tasks = tasksOn(data.tasks, date);
  const ticks = data.checks[date] ?? {};
  const total = tasks.length;
  const done = tasks.filter((task) => ticks[task.id]).length;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-sm text-fg-muted">{tx.howTo}</p>
        <div>
          <div className="mb-1.5 flex justify-end text-sm">
            <span className={cn(done === total ? 'font-medium text-success' : 'text-fg-muted')}>
              {done === total ? tx.allDone : tx.progress(done, total)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${(100 * done) / total}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="border-t border-border">
        {tasks.map((task, index) => {
          if (editing === task.id) {
            return (
              <li key={task.id} className="border-b border-border last:border-b-0">
                <TaskEditor
                  task={task}
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
          const title = (
            <span className="flex flex-col">
              <span className={cn('font-medium', tickedAt && 'text-fg-muted line-through')}>
                {name}
              </span>
              {tickedAt && (
                <span className="text-xs text-success">{tx.doneAt(time(tickedAt))}</span>
              )}
            </span>
          );
          return (
            <li
              key={task.id}
              className={cn(
                'border-b border-l-4 border-border last:border-b-0',
                tickedAt ? 'border-l-success' : 'border-l-transparent',
              )}
            >
              <div className="flex items-center gap-3 px-5 py-2">
                <input
                  id={checkId}
                  type="checkbox"
                  aria-label={name}
                  checked={!!tickedAt}
                  onChange={(e) => setDone(date, task.id, e.target.checked)}
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
                <div
                  id={panelId}
                  className="animate-fade-in px-5 pb-4 pl-14 text-sm leading-relaxed whitespace-pre-wrap text-fg-muted"
                >
                  {task.description}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
