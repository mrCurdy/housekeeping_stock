import type { DayTask } from '@app/shared';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { NoteEditor } from './NoteEditor';

/**
 * One task of the selected day opened for editing: name, instructions (with lists and
 * checklists), order and removal.
 * Changes apply from that day on; earlier days keep the list as it was.
 * The text is saved only on Save (or Enter in the name), never on blur; Escape cancels.
 */
export function TaskEditor({
  task,
  group,
  index,
  count,
  onClose,
}: {
  task: DayTask;
  /** The group it is listed in; ↑/↓ move it within that group */
  group: string;
  index: number;
  /** Tasks of that group on that day's list */
  count: number;
  onClose: () => void;
}) {
  const { updateTask, removeTask, moveTask } = useStock();
  const { date } = useSelectedDate();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const tx = t.checklist.manage;
  const day = formatLongDate(date, locale);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description);

  return (
    <form
      className="flex flex-col gap-2 border-l-4 border-l-primary bg-surface-2/50 px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        if (trimmed !== task.name || description !== task.description) {
          updateTask(task.id, { name: trimmed, description, from: date });
        }
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={tx.taskName}
        aria-label={tx.taskName}
        className="font-medium"
        autoFocus
      />
      <NoteEditor
        value={description}
        onChange={setDescription}
        placeholder={tx.instructionsPlaceholder}
        label={tx.instructions}
      />
      <p className="text-xs text-fg-muted">{tx.appliesFrom(day)}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={tx.moveUp}
          aria-label={tx.moveUp}
          disabled={index === 0}
          onClick={() => moveTask(task.id, group, index - 1, date)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={tx.moveDown}
          aria-label={tx.moveDown}
          disabled={index === count - 1}
          onClick={() => moveTask(task.id, group, index + 1, date)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={tx.removeTask}
          aria-label={tx.removeTaskNamed(task.name)}
          className="text-fg-muted hover:text-danger"
          onClick={async () => {
            if (
              await confirm({
                title: tx.removeTitle(task.name),
                description: tx.removeDescription(day),
                confirmLabel: t.common.remove,
              })
            ) {
              removeTask(task.id, date);
              onClose();
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" size="sm" disabled={!name.trim()}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </form>
  );
}
