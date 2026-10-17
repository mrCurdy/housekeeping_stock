import { useState } from 'react';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, Button, Spinner } from '@/components/ui';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { DeparturesCard } from './stock/DeparturesCard';
import { GroupItemsModal } from './stock/GroupItemsModal';
import { ItemsCard } from './stock/ItemsCard';
import { Legend } from './stock/Legend';
import { OverviewCard } from './stock/OverviewCard';

/** /stock: departures, the day's consumption / income / stock per item, and the overview. */
export default function Stock() {
  const { data, loading, loadError, reload } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const hasGroups = data.groups.length > 0;

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
          <div
            className={cn(
              'grid items-start gap-6',
              hasGroups && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
            )}
          >
            {hasGroups && <DeparturesCard onEditGroup={setEditGroupId} />}
            <ItemsCard />
          </div>
          {data.items.length > 0 && <OverviewCard />}
          <Legend />
        </div>
      )}

      <GroupItemsModal groupId={editGroupId} onClose={() => setEditGroupId(null)} />
    </>
  );
}
