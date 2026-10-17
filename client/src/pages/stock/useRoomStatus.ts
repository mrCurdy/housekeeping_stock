import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';

/**
 * "2/3 rooms" caption for a total that comes from the room counts;
 * null when the total is typed by hand or calculated.
 */
export function useRoomStatus() {
  const { data, math } = useStock();
  const { t } = useI18n();
  return (itemId: string, date: string) => {
    if (data.records[itemId]?.[date]?.m != null || math.roomSum(itemId, date) == null) return null;
    const counted = data.locations.filter((l) => data.counts[date]?.[l.id]?.[itemId] != null);
    return {
      label: t.stock.items.roomsCounted(counted.length, data.locations.length),
      title: t.stock.items.countedIn(
        counted.map((l) => l.name).join(', ') || t.stock.items.removedRooms,
      ),
    };
  };
}
