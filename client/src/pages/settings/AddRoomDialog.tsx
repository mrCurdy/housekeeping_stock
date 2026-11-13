import { ROOM_NOTE_MAX } from '@app/shared';
import { useId, useState } from 'react';
import { Button, FormField, Input, Modal, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { roomExists, typeOptions } from '../rooms/roomText';

/**
 * A new room card (admin, `setup`): number, type (when room types exist) and note. A taken number
 * shows the error here before anything is sent. Mount it only while open (fresh fields each time).
 */
export function AddRoomDialog({ onClose }: { onClose: () => void }) {
  const { data, addRoom } = useStock();
  const { t } = useI18n();
  const tx = t.rooms;
  const ts = t.settings.rooms;
  const formId = useId();
  const [number, setNumber] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = number.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title={ts.addRoomTitle}
      description={ts.addRoomDescription}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            {t.common.add}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trimmed) return;
          if (roomExists(data.rooms, trimmed)) return setError(tx.exists(trimmed));
          setBusy(true);
          const room = await addRoom({
            number: trimmed,
            ...(type && { type }),
            ...(note.trim() && { note: note.trim() }),
          });
          setBusy(false);
          if (room) onClose();
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
