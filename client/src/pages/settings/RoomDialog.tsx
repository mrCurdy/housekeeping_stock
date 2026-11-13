import { ROOM_NOTE_MAX, type Room, type RoomPatchInput } from '@app/shared';
import { useId, useState } from 'react';
import { Button, FormField, Input, Modal, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { roomExists, typeOptions } from '../rooms/roomText';

/**
 * A room card's number, type (when room types exist) and note (admin, `setup`). Without `room` it
 * adds a new card; with `room` it edits that one and sends only the changed fields (`type: ''` /
 * `note: ''` clear them). A number taken by another card shows the error here before anything is
 * sent. Mount it only while open (fresh fields each time).
 */
export function RoomDialog({ room, onClose }: { room?: Room; onClose: () => void }) {
  const { data, addRoom, updateRoom } = useStock();
  const { t } = useI18n();
  const tx = t.rooms;
  const ts = t.settings.rooms;
  const formId = useId();
  const [number, setNumber] = useState(room?.number ?? '');
  const [type, setType] = useState(room?.type ?? '');
  const [note, setNote] = useState(room?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = number.trim();

  const save = async () => {
    if (!room) {
      setBusy(true);
      const added = await addRoom({
        number: trimmed,
        ...(type && { type }),
        ...(note.trim() && { note: note.trim() }),
      });
      setBusy(false);
      if (added) onClose();
      return;
    }
    const patch: RoomPatchInput = {};
    if (trimmed !== room.number) patch.number = trimmed;
    if (type !== (room.type ?? '')) patch.type = type;
    if (note.trim() !== (room.note ?? '')) patch.note = note.trim();
    if (Object.keys(patch).length) updateRoom(room.id, patch);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={room ? ts.editRoomTitle(room.number) : ts.addRoomTitle}
      description={ts.addRoomDescription}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            {room ? t.common.save : t.common.add}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed) return;
          if (roomExists(data.rooms, trimmed, room?.id)) return setError(tx.exists(trimmed));
          void save();
        }}
      >
        <FormField label={tx.number} error={error}>
          <Input
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setError(null);
            }}
            maxLength={20}
            autoFocus
          />
        </FormField>
        {data.roomTypes.length > 0 && (
          <FormField label={tx.type}>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={typeOptions(data.roomTypes, tx.noType)}
            />
          </FormField>
        )}
        <FormField label={ts.addRoomNote}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tx.notePlaceholder}
            maxLength={ROOM_NOTE_MAX}
            rows={3}
          />
        </FormField>
      </form>
    </Modal>
  );
}
