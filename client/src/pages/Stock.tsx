import { stockCardOrder, type StockCard } from '@app/shared';
import { GripVertical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, Button, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { useDragSort } from '@/lib/useDragSort';
import { DeparturesCard } from './stock/DeparturesCard';
import { GroupItemsModal } from './stock/GroupItemsModal';
import { ItemsCard } from './stock/ItemsCard';
import { Legend } from './stock/Legend';
import { OverviewCard } from './stock/OverviewCard';

/**
 * /stock: departures, the day's consumption / income / stock per item, and the overview, in the
 * order the admin dragged them into (drop a card's grip on the card whose place it takes, or ↑/↓
 * on it). Departures and Stock share a row on wide screens while they are next to each other.
 */
export default function Stock() {
  const { data, loading, loadError, reload, setStockCards } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const canMove = useAuth().can('setup');
  const [editGroupId, setEditGroupId] = useState<string | null>(null);

  const order = stockCardOrder(data.stockCards);
  const shown = order.filter(
    (card) =>
      (card !== 'departures' || data.groups.length > 0) &&
      (card !== 'overview' || data.items.length > 0),
  );
  // Moves among the shown cards; hidden ones keep their place in the saved order
  const sort = useDragSort(
    shown.length,
    (from, to) => {
      const card = shown[from]!;
      const next = order.filter((c) => c !== card);
      next.splice(next.indexOf(shown[to]!) + (to > from ? 1 : 0), 0, card);
      setStockCards(next);
    },
    { free: true },
  );

  const title: Record<StockCard, string> = {
    departures: t.stock.departures.title,
    items: t.stock.items.title,
    overview: t.stock.overview.title,
  };
  const grip = (index: number): ReactNode =>
    canMove && shown.length > 1 ? (
      <button
        type="button"
        title={t.stock.moveCard}
        aria-label={t.stock.moveCardNamed(title[shown[index]!])}
        className={cn(
          'focus-ring -my-1 -ml-3 flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted select-none hover:text-fg',
          sort.dragging === index && 'cursor-grabbing',
        )}
        {...sort.handleProps(index)}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    ) : undefined;
  const card = (index: number) => {
    const id = shown[index]!;
    return (
      <div
        key={id}
        ref={sort.rowRef(index)}
        style={sort.rowStyle(index)}
        className={cn(
          'rounded-lg',
          sort.dragging === index && 'shadow-lg',
          sort.over === index && 'ring-2 ring-primary',
        )}
      >
        {id === 'departures' ? (
          <DeparturesCard onEditGroup={setEditGroupId} grip={grip(index)} />
        ) : id === 'items' ? (
          <ItemsCard grip={grip(index)} />
        ) : (
          <OverviewCard grip={grip(index)} />
        )}
      </div>
    );
  };

  // Rows of card indexes: Departures and Stock next to each other share one
  const rows: number[][] = [];
  shown.forEach((id, index) => {
    const prev = rows.at(-1);
    const paired = prev?.length === 1 && shown[prev[0]!] !== 'overview' && id !== 'overview';
    if (paired) prev.push(index);
    else rows.push([index]);
  });

  return (
    <>
      <PageHeader
        title={t.stock.title}
        description={formatLongDate(date, locale)}
        actions={<DateSwitcher />}
      />

      {loadError && (
        <Alert tone="danger" title={t.common.loadFailed} className="mb-6">
          {loadError}{' '}
          <Button variant="link" onClick={() => void reload()}>
            {t.common.tryAgain}
          </Button>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-24 text-fg-muted">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map((row) =>
            row.length === 1 ? (
              card(row[0]!)
            ) : (
              <div
                key="pair"
                className={cn(
                  // grid-cols-1 (minmax(0,1fr)) so wide tables scroll inside their card on phones
                  'grid grid-cols-1 items-start gap-6',
                  shown[row[0]!] === 'departures'
                    ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
                    : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
                )}
              >
                {row.map(card)}
              </div>
            ),
          )}
          <Legend />
        </div>
      )}

      <GroupItemsModal groupId={editGroupId} onClose={() => setEditGroupId(null)} />
    </>
  );
}
