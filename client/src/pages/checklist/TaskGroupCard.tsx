import type { DayTask, TaskGroup } from '@app/shared';
import { ListChecks, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AddForm } from '@/components/AddForm';
import { Button, Card, CardHeader, CardTitle, EmptyState, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import type { useListsDragSort } from '@/lib/useListsDragSort';
import { TaskList } from './TaskList';

/**
 * One checklist group as a card: its name (✎ renames or deletes it), the group's progress, its
 * tasks and a "New task" line. `grip` (from the page) drags the card to another place.
 * Deleting moves the tasks to the group above (`above`, or the next one for the first group).
 */
export function TaskGroupCard({
  group,
  tasks,
  list,
  only,
  checklistEmpty,
  above,
  sort,
  grip,
  onAllDone,
}: {
  group: TaskGroup;
  tasks: DayTask[];
  /** Its place among the cards */
  list: number;
  /** It is the only group (can't be deleted) */
  only: boolean;
  /** No group has tasks that day: show the big empty state */
  checklistEmpty: boolean;
  /** The group its tasks move to when it is deleted */
  above: TaskGroup | undefined;
  sort: ReturnType<typeof useListsDragSort>;
  grip?: ReactNode;
  onAllDone: () => void;
}) {
  const { data, addTask, renameTaskGroup, removeTaskGroup } = useStock();
  const { date } = useSelectedDate();
  const confirm = useConfirm();
  const { t } = useI18n();
  const tx = t.checklist;
  const tg = tx.groups;
  const canEdit = useAuth().can('tasks');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const title = (g: TaskGroup) => g.name || tg.defaultName;

  const ticks = data.checks[date] ?? {};
  const total = tasks.length;
  const done = tasks.filter((task) => ticks[task.id]).length;

  const addForm = (
    <AddForm
      placeholder={tx.manage.newTask}
      label={tx.manage.addTask}
      onAdd={(task) => addTask(task, '', date, group.id)}
    />
  );

  const remove = async () => {
    if (
      await confirm({
        title: tg.removeTitle(title(group)),
        description: tg.removeDescription(above ? title(above) : ''),
        confirmLabel: t.common.remove,
      })
    ) {
      removeTaskGroup(group.id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-1">
        {grip}
        {editing ? (
          <form
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() !== group.name) renameTaskGroup(group.id, name.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tg.defaultName}
              aria-label={tg.name}
              maxLength={100}
              className="min-w-40 flex-1 font-medium"
              autoFocus
            />
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={only ? tg.lastGroup : tg.remove}
                aria-label={tg.removeNamed(title(group))}
                disabled={only}
                className="text-fg-muted hover:text-danger"
                onClick={() => void remove()}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm">
                {t.common.save}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start gap-2">
              <CardTitle className="min-w-0 flex-1 break-words">{title(group)}</CardTitle>
              {total > 0 && (
                <span
                  className={cn(
                    'shrink-0 text-sm',
                    done === total ? 'font-medium text-success' : 'text-fg-muted',
                  )}
                >
                  {done === total ? tx.allDone : tx.progress(done, total)}
                </span>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={tg.edit}
                  aria-label={tg.editNamed(title(group))}
                  className="-my-1 shrink-0 text-fg-muted"
                  onClick={() => {
                    setName(group.name);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
            {total > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${(100 * done) / total}%` }}
                />
              </div>
            )}
          </div>
        )}
      </CardHeader>

      {total > 0 ? (
        <>
          <TaskList group={group.id} tasks={tasks} list={list} sort={sort} onAllDone={onAllDone} />
          {canEdit && <div className="border-t border-border px-5 py-4">{addForm}</div>}
        </>
      ) : checklistEmpty ? (
        <>
          {canEdit && <div className="px-5 pt-5">{addForm}</div>}
          <EmptyState
            icon={<ListChecks />}
            title={tx.emptyTitle}
            description={canEdit ? tx.emptyDescription : t.common.askAdmin}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-sm text-fg-muted">{canEdit ? tg.empty : tg.emptyForWorker}</p>
          {canEdit && addForm}
        </div>
      )}
    </Card>
  );
}
