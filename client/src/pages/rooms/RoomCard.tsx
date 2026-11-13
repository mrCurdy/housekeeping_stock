import { ROOM_NOTE_MAX, roomStatusList, unitsByGroup, unitStatusOf, type Room } from '@app/shared';
import { Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardTitle, CommitTextarea, Input, Select } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { roomExists, statusName, typeOptions } from './roomText';
import { WhoDialog } from './WhoDialog';

type Pending = { unitId: string; statusId: string } | null;

/**
 * One room card: number and type (✎ edits them or deletes the card), its note, every master unit
 * with its status (admin only: the `/rooms` page). A status change first asks who did it
 * (`WhoDialog`). General cleanings live on the `/cleaning` page, not here. Opened from a compact tile it
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
  const { data, updateRoom, removeRoom, setUnitStatus } = useStock();
  const { t, locale } = useI18n();
  const tx = t.rooms;
  // The units group by group (a heading per group once there are several)
  const unitGroups = unitsByGroup(data).filter((g) => g.units.length > 0);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const statuses = roomStatusList(data);
  const statusOptions = statuses.map((s) => ({
    value: s.id,
    label: statusName(s, tx.defaultStatus),
  }));
  const type = data.roomTypes.find((rt) => rt.id === room.type);
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

  const pendingUnit = pending && data.roomUnits.find((u) => u.id === pending.unitId);
  const pendingStatus = pending && statuses.find((s) => s.id === pending.statusId);

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

          {unitGroups.map(({ group, units }) => (
            <section key={group.id} className="flex flex-col gap-2">
              {unitGroups.length > 1 && (
                <h4 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  {group.name || t.settings.rooms.defaultGroup}
                </h4>
              )}
              <ul className="flex flex-col gap-2">
                {units.map((unit) => {
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
                          onChange={(e) =>
                            setPending({ unitId: unit.id, statusId: e.target.value })
                          }
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
            </section>
          ))}
        </div>
      </Card>

      {pending && pendingUnit && pendingStatus && (
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
