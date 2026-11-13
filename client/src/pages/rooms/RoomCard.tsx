import {
  cleanThresholds,
  cleaningLevel,
  formatDate,
  latestCleaning,
  ROOM_NOTE_MAX,
  roomStatusList,
  unitStatusOf,
  type Room,
} from '@app/shared';
import { ChevronDown, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardTitle, CommitTextarea, Input, Select } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/format';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { cleaningText, roomExists, statusName, typeOptions } from './roomText';
import { WhoDialog } from './WhoDialog';

/** Shown in the history expander. */
const HISTORY_SHOWN = 10;

type Pending = { unitId: string; statusId: string } | 'clean' | null;

/**
 * One room card: number and type (✎ edits them or deletes the card), its note, every master unit
 * with its status, and the general-cleaning line with "Cleaned" and the cleaning history.
 * Status changes and cleanings first ask who did it (`WhoDialog`). Opened from a compact tile it
 * gets `onClose` (an × that turns it back into the tile) and a `className` for the grid.
 */
export function RoomCard({
  room,
  onClose,
  className,
}: {
  room: Room;
  onClose?: () => void;
  className?: string;
}) {
  const { data, updateRoom, removeRoom, setUnitStatus, markCleaned } = useStock();
  const { t, locale } = useI18n();
  const tx = t.rooms;
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const statuses = roomStatusList(data);
  const statusOptions = statuses.map((s) => ({
    value: s.id,
    label: statusName(s, tx.defaultStatus),
  }));
  const type = data.roomTypes.find((rt) => rt.id === room.type);
  const cleanings = data.cleanings[room.id] ?? [];
  const last = latestCleaning(data, room.id);
  // "Days ago" counts from the real today, not the date switcher's day
  const level = cleaningLevel(last?.date, formatDate(new Date()), cleanThresholds(data.settings));
  const when = (at: string) =>
    new Date(at).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const remove = async () => {
    if (
      await confirm({
        title: tx.removeTitle(room.number),
        description: tx.removeDescription,
        confirmLabel: t.common.remove,
      })
    ) {
      removeRoom(room.id);
    }
  };

  const pendingUnit =
    pending && pending !== 'clean'
      ? data.roomUnits.find((u) => u.id === pending.unitId)
      : undefined;
  const pendingStatus =
    pending && pending !== 'clean' ? statuses.find((s) => s.id === pending.statusId) : undefined;

  return (
    <article aria-label={tx.roomNamed(room.number)} className={cn('min-w-0', className)}>
      <Card className="flex h-full flex-col">
        {editing ? (
          <RoomEditor
            room={room}
            onDone={() => setEditing(false)}
            onRemove={() => void remove()}
            onSave={(patch) => {
              if (Object.keys(patch).length) updateRoom(room.id, patch);
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-start gap-2 px-5 pt-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <CardTitle className="text-xl break-words">{room.number}</CardTitle>
              {type && <p className="text-sm text-fg-muted">{type.name}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              title={tx.edit(room.number)}
              aria-label={tx.edit(room.number)}
              className="text-fg-muted"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={tx.filter.closeRoom(room.number)}
                aria-label={tx.filter.closeRoom(room.number)}
                className="text-fg-muted"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 px-5 py-4">
          <CommitTextarea
            value={room.note ?? ''}
            onCommit={(text) => {
              if (text.trim() !== (room.note ?? '')) updateRoom(room.id, { note: text.trim() });
            }}
            placeholder={tx.notePlaceholder}
            aria-label={tx.noteNamed(room.number)}
            maxLength={ROOM_NOTE_MAX}
            rows={2}
          />

          {data.roomUnits.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.roomUnits.map((unit) => {
                const { status, entry } = unitStatusOf(data, room.id, unit.id);
                const colors = ROOM_COLOR_CLASSES[status.color];
                return (
                  <li
                    key={unit.id}
                    className={cn('rounded-md border-l-4 px-3 py-2', colors.border, colors.soft)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium break-words">
                        {unit.name}
                      </span>
                      <Select
                        value={status.id}
                        onChange={(e) => setPending({ unitId: unit.id, statusId: e.target.value })}
                        options={statusOptions}
                        aria-label={tx.statusOf(unit.name, room.number)}
                        className="w-40 shrink-0"
                      />
                    </div>
                    {entry?.note && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{entry.note}</p>
                    )}
                    {entry && (
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {tx.setBy(entry.by, when(entry.at))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                ROOM_COLOR_CLASSES[level.color].dot,
              )}
            />
            <span
              className={cn(
                'min-w-0 flex-1 text-sm font-medium',
                ROOM_COLOR_CLASSES[level.color].text,
              )}
            >
              {cleaningText(level.days, last?.by ?? '', tx)}
            </span>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Sparkles className="h-4 w-4" />}
              onClick={() => setPending('clean')}
            >
              {tx.cleaned}
            </Button>
          </div>
          {cleanings.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={historyOpen}
                className="focus-ring flex items-center gap-1 self-start rounded text-xs text-fg-muted hover:text-fg"
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', historyOpen && 'rotate-180')}
                />
                {tx.history}
              </button>
              {historyOpen && (
                <ol className="flex flex-col gap-0.5 text-xs text-fg-muted">
                  {cleanings.slice(0, HISTORY_SHOWN).map((c, i) => (
                    <li key={`${c.date}-${i}`}>{tx.setBy(formatLongDate(c.date, locale), c.by)}</li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </Card>

      {pending === 'clean' && (
        <WhoDialog
          title={tx.who.cleanTitle(room.number)}
          onCancel={() => setPending(null)}
          onConfirm={(by) => {
            markCleaned(room.id, by);
            setPending(null);
          }}
        />
      )}
      {pending && pending !== 'clean' && pendingUnit && pendingStatus && (
        <WhoDialog
          title={tx.who.statusTitle(pendingUnit.name, statusName(pendingStatus, tx.defaultStatus))}
          withNote
          onCancel={() => setPending(null)}
          onConfirm={(by, note) => {
            setUnitStatus(room.id, pending.unitId, {
              status: pending.statusId,
              by,
              ...(note && { note }),
            });
            setPending(null);
          }}
        />
      )}
    </article>
  );
}

/** The card header in edit mode: number, type, delete (confirmed), Cancel / Save. */
function RoomEditor({
  room,
  onDone,
  onRemove,
  onSave,
}: {
  room: Room;
  onDone: () => void;
  onRemove: () => void;
  onSave: (patch: { number?: string; type?: string }) => void;
}) {
  const { data } = useStock();
  const { t } = useI18n();
  const tx = t.rooms;
  const [number, setNumber] = useState(room.number);
  const [type, setType] = useState(room.type ?? '');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 px-5 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = number.trim();
        if (!trimmed) return;
        if (roomExists(data.rooms, trimmed, room.id)) return setError(tx.exists(trimmed));
        onSave({
          ...(trimmed !== room.number && { number: trimmed }),
          ...(type !== (room.type ?? '') && { type }),
        });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone();
      }}
    >
      <Input
        value={number}
        onChange={(e) => {
          setNumber(e.target.value);
          setError(null);
        }}
        aria-label={tx.number}
        maxLength={20}
        invalid={!!error}
        className="font-medium"
        autoFocus
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {data.roomTypes.length > 0 && (
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={typeOptions(data.roomTypes, tx.noType)}
          aria-label={tx.type}
        />
      )}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={tx.remove(room.number)}
          aria-label={tx.remove(room.number)}
          className="mr-auto text-fg-muted hover:text-danger"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" size="sm">
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}
