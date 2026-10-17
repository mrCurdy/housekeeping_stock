import { isTaskOn } from '@app/shared';
import { ListChecks } from 'lucide-react';
import { AddForm } from '@/components/AddForm';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, Card, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { ShiftNotes } from './checklist/ShiftNotes';
import { TaskList } from './checklist/TaskList';

/**
 * /checklist: the same tasks every day, ticked off during the day (ticks are per day, so each
 * new day starts empty), and a note for the next shift below them. The "New task" line comes first
 * while there are no tasks, and below the list once there are.
 */
export default function Checklist() {
  const { data, loading, loadError, addTask } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.checklist;
  const canEdit = useAuth().can('tasks');

  const addForm = (
    <AddForm
      placeholder={tx.manage.newTask}
      label={tx.manage.addTask}
      onAdd={(name) => addTask(name, '', date)}
    />
  );

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
          <Card>
            {!data.tasks.some((task) => isTaskOn(task, date)) ? (
              <>
                {canEdit && <div className="px-5 pt-5">{addForm}</div>}
                <EmptyState
                  icon={<ListChecks />}
                  title={tx.emptyTitle}
                  description={canEdit ? tx.emptyDescription : t.common.askAdmin}
                />
              </>
            ) : (
              <>
                <TaskList />
                {canEdit && <div className="border-t border-border px-5 py-4">{addForm}</div>}
              </>
            )}
          </Card>
          <ShiftNotes />
          <p className="text-center text-xs text-fg-muted">{tx.keptDays}</p>
        </div>
      )}
    </>
  );
}
