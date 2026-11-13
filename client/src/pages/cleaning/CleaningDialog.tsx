import { latestCleaning, type Room } from '@app/shared';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { CleaningHistory } from '../rooms/CleaningHistory';
import { cleaningText } from '../rooms/roomText';
import { cleaningDays } from '../rooms/roomView';
import { WhoDialog } from '../rooms/WhoDialog';

/**
 * A tapped cleaning tile: the room number and type, its latest general cleaning, the history and
 * "who" (required, remembered per device). "Cleaned today" registers a cleaning for today
 * (`markCleaned`) and closes; Cancel changes nothing.
 */
export function CleaningDialog({
  room,
  today,
  onClose,
}: {
  room: Room;
  today: string;
  onClose: () => void;
}) {
  const { data, markCleaned } = useStock();
  const { t } = useI18n();
  const type = data.roomTypes.find((rt) => rt.id === room.type);
  const { days } = cleaningDays(data, room.id, today);

  return (
    <WhoDialog
      title={t.rooms.roomNamed(room.number)}
      description={type?.name}
      confirmLabel={t.cleaning.cleanedToday}
      onCancel={onClose}
      onConfirm={(by) => {
        markCleaned(room.id, by);
        onClose();
      }}
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
