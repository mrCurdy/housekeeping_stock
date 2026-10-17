import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';

/** Items × rooms for the selected day, plus the sum that becomes the stock figure. */
export function AllRoomsTable({ progress }: { progress: (locationId: string) => number }) {
  const { data, math } = useStock();
  const { date } = useSelectedDate();
  const { t } = useI18n();
  const day = data.counts[date] ?? {};
  const known = new Set(data.locations.map((l) => l.id));

  // Counts from rooms that were removed since: they still count in the sums
  const removedRooms = Object.keys(day).filter((id) => !known.has(id));
  const removedSum = (itemId: string) => {
    let sum: number | null = null;
    for (const id of removedRooms) {
      const v = day[id]?.[itemId];
      if (v != null) sum = (sum ?? 0) + v;
    }
    return sum;
  };

  const cell = (v: number | null | undefined, extra = '', key?: string) => (
    <Td
      key={key}
      className={cn(
        'text-right tabular-nums',
        v == null ? 'text-fg-muted' : 'font-semibold',
        extra,
      )}
    >
      {v ?? '—'}
    </Td>
  );

  return (
    <Table>
      <THead>
        <tr>
          <Th>{t.common.stockName}</Th>
          {data.locations.map((loc) => (
            <Th key={loc.id} className="text-right normal-case">
              {loc.name || t.common.unnamedRoom}
              <div className="font-normal">
                {t.counter.countedShort(progress(loc.id), data.items.length)}
              </div>
            </Th>
          ))}
          {removedRooms.length > 0 && (
            <Th className="text-right" title={t.counter.removedRoomsHint}>
              {t.counter.removedRooms}
            </Th>
          )}
          <Th className="text-right">{t.counter.sum}</Th>
        </tr>
      </THead>
      <TBody>
        {data.items.map((item) => (
          <Tr key={item.id}>
            <Td className="font-medium whitespace-nowrap">{item.name || t.common.unnamedItem}</Td>
            {data.locations.map((loc) => cell(day[loc.id]?.[item.id], '', loc.id))}
            {removedRooms.length > 0 && cell(removedSum(item.id), 'text-fg-muted')}
            {cell(math.roomSum(item.id, date), 'text-primary')}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
