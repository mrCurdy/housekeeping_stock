import { addDays, formatDate, latestCleaning, parseDateLocal, type Room } from '@app/shared';
import { useId, useState } from 'react';
import { Button, FormField, Input, Modal } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { CleaningHistory } from '../rooms/CleaningHistory';
import { cleaningText } from '../rooms/roomText';
import { cleaningDays } from '../rooms/roomView';
import { WhoDialog } from '../rooms/WhoDialog';

/**
 * A tapped cleaning tile: the room number and type, its latest general cleaning, the history and
 * "who" (required, remembered per device). "Cleaned today" registers a cleaning for today
 * (`markCleaned`), closes and calls `onCleaned` (the page plays the salute). "Choose date" swaps to
 * a date picker (yesterday preset, no future days): "Mark cleaned" registers it on that day (the
 * salute only when it is today), Back returns. Cancel changes nothing.
 */
export function CleaningDialog({
  room,
  today,
  onClose,
  onCleaned,
}: {
  room: Room;
  today: string;
  onClose: () => void;
  onCleaned: () => void;
}) {
  const { data, markCleaned } = useStock();
  const { t } = useI18n();
  const formId = useId();
  /** The name typed before "Choose date": the picker is showing */
  const [pickBy, setPickBy] = useState<string | null>(null);
  const [date, setDate] = useState(() => formatDate(addDays(parseDateLocal(today), -1)));
  const type = data.roomTypes.find((rt) => rt.id === room.type);
  const { days } = cleaningDays(data, room.id, today);

  const done = (by: string, day: string) => {
    markCleaned(room.id, by, day);
    onClose();
    if (day === today) onCleaned();
  };

  if (pickBy !== null) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
    return (
      <Modal
        open
        onClose={onClose}
        title={t.cleaning.pickTitle(room.number)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPickBy(null)}>
              {t.cleaning.back}
            </Button>
            <Button type="submit" form={formId} disabled={!valid}>
              {t.cleaning.markCleaned}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) done(pickBy, date);
          }}
        >
          <FormField label={t.cleaning.pickDate}>
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              autoFocus
            />
          </FormField>
        </form>
      </Modal>
    );
  }

  return (
    <WhoDialog
      title={t.rooms.roomNamed(room.number)}
      description={type?.name}
      confirmLabel={t.cleaning.cleanedToday}
      extraAction={{ label: t.cleaning.chooseDate, onClick: setPickBy }}
      onCancel={onClose}
      onConfirm={(by) => done(by, today)}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-fg">
          {cleaningText(days, latestCleaning(data, room.id)?.by ?? '', t.rooms)}
        </p>
        <CleaningHistory roomId={room.id} />
      </div>
    </WhoDialog>
  );
}
