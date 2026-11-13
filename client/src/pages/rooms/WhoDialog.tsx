import { ROOM_NOTE_MAX } from '@app/shared';
import { useId, useState, type ReactNode } from 'react';
import { Button, FormField, Input, Modal, Textarea } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';

const NAME_KEY = 'rooms.who';

/** The last name typed on this device (a convenience: storage may be blocked). */
function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode or blocked storage: the next dialog starts empty
  }
}

/**
 * "Who did it" before a room change: a required name (prefilled with the last one typed on this
 * device) and, with `withNote`, an optional note. Cancel changes nothing. `children` show above the
 * name (the cleaning dialog's latest cleaning and history); `confirmLabel` replaces "Confirm".
 * `extraAction` adds a secondary button left of the confirm one (the cleaning dialog's "Choose
 * date"): it also needs the name and remembers it. With it, Cancel hides on phones (the × closes)
 * so both actions share one row.
 */
export function WhoDialog({
  title,
  description,
  confirmLabel,
  extraAction,
  withNote = false,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  extraAction?: { label: string; onClick: (by: string) => void };
  withNote?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: (by: string, note: string) => void;
}) {
  const { t } = useI18n();
  const tx = t.rooms.who;
  const formId = useId();
  const [name, setName] = useState(lastName);
  const [note, setNote] = useState('');
  const by = name.trim();

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onCancel}
            className={extraAction ? 'hidden sm:inline-flex' : undefined}
          >
            {t.common.cancel}
          </Button>
          {extraAction && (
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              disabled={!by}
              onClick={() => {
                rememberName(by);
                extraAction.onClick(by);
              }}
            >
              {extraAction.label}
            </Button>
          )}
          <Button
            type="submit"
            form={formId}
            disabled={!by}
            className={extraAction ? 'flex-1 sm:flex-none' : undefined}
          >
            {confirmLabel ?? t.common.confirm}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!by) return;
          rememberName(by);
          onConfirm(by, note.trim());
        }}
      >
        {children}
        <FormField label={tx.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
            autoFocus
          />
        </FormField>
        {withNote && (
          <FormField label={tx.note}>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tx.notePlaceholder}
              maxLength={ROOM_NOTE_MAX}
              rows={3}
            />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
