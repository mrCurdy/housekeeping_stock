import { DEFAULT_SALUTE_TEXT, tasksByGroup } from '@app/shared';
import { GripVertical } from 'lucide-react';
import { useCallback, useState } from 'react';
import { AddForm } from '@/components/AddForm';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Salute } from '@/components/Salute';
import { Alert, Card, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { useDragSort } from '@/lib/useDragSort';
import { useListsDragSort } from '@/lib/useListsDragSort';
import { ShiftNotes } from './checklist/ShiftNotes';
import { TaskGroupCard } from './checklist/TaskGroupCard';

/**
 * /checklist: the same tasks every day, ticked off during the day (ticks are per day, so each
 * new day starts empty), split into group cards ("Before 11", "Service"…), and a note for the
 * next shift below them. With `tasks` permission the cards are dragged by their grip into another
 * order, tasks are dragged between cards, and "Add group" sits below the last card. Ticking a
 * group's last task plays the fireworks.
 */
export default function Checklist() {
  const { data, loading, loadError, moveTask, moveTaskGroup, addTaskGroup } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.checklist;
  const canEdit = useAuth().can('tasks');
  const [salute, setSalute] = useState(false);
  const endSalute = useCallback(() => setSalute(false), []);

  const all = tasksByGroup(data.tasks, data.taskGroups, date);
  const empty = all.every((g) => !g.tasks.length);
  // Others don't see empty groups (but the first one when there is nothing at all)
  const shown = canEdit ? all : empty ? all.slice(0, 1) : all.filter((g) => g.tasks.length);

  const groupSort = useDragSort(shown.length, moveTaskGroup);
  const taskSort = useListsDragSort(
    shown.map((g) => g.tasks.length),
    (from, to) => {
      const id = shown[from.list]!.tasks[from.index]!.id;
      moveTask(id, shown[to.list]!.group.id, to.index, date);
      // A move to another card re-creates the row: keep the keyboard on its grip (unless the
      // focus has gone somewhere else meanwhile)
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        document.querySelector<HTMLElement>(`[data-task-grip="${id}"]`)?.focus();
      });
    },
  );

  const grip = (index: number) => {
    if (!canEdit || shown.length < 2) return undefined;
    const name = shown[index]!.group.name || tx.groups.defaultName;
    return (
      <button
        type="button"
        title={tx.groups.drag}
        aria-label={tx.groups.dragNamed(name)}
        className={cn(
          'focus-ring -my-1 -ml-3 flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted select-none hover:text-fg',
          groupSort.dragging === index && 'cursor-grabbing',
        )}
        {...groupSort.handleProps(index)}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title={tx.title}
        description={formatLongDate(date, locale)}
        actions={<DateSwitcher />}
      />

      {loadError && (
        <Alert tone="danger" title={t.common.loadFailed} className="mb-6">
          {loadError}
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-24 text-fg-muted">
          <Spinner />
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {!empty && <p className="px-1 text-sm text-fg-muted">{tx.howTo}</p>}
          {shown.map(({ group, tasks }, index) => (
            <div
              key={group.id}
              ref={(el) => {
                groupSort.rowRef(index)(el);
                taskSort.listRef(index)(el);
              }}
              style={groupSort.rowStyle(index)}
              className={cn(
                'rounded-lg',
                groupSort.dragging === index && 'shadow-lg',
                taskSort.target?.list === index && 'ring-2 ring-primary',
              )}
            >
              <TaskGroupCard
                group={group}
                tasks={tasks}
                list={index}
                only={all.length === 1}
                checklistEmpty={empty}
                above={all[index === 0 ? 1 : index - 1]?.group}
                sort={taskSort}
                grip={grip(index)}
                onAllDone={() => setSalute(true)}
              />
            </div>
          ))}
          {canEdit && (
            <Card className="px-5 py-4">
              <AddForm
                placeholder={tx.groups.newGroup}
                label={tx.groups.addGroup}
                onAdd={addTaskGroup}
              />
            </Card>
          )}
          <ShiftNotes />
          <p className="text-center text-xs text-fg-muted">{tx.keptDays}</p>
        </div>
      )}
      {salute && (
        <Salute text={data.settings.saluteText || DEFAULT_SALUTE_TEXT} onDone={endSalute} />
      )}
    </>
  );
}
