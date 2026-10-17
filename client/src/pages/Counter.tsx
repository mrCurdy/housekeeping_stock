import { todayOnly } from '@app/shared';
import { ClipboardList, Package } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, buttonVariants, Card, EmptyState, Spinner } from '@/components/ui';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { AllRoomsTable } from './counter/AllRoomsTable';
import { ManageRooms } from './counter/ManageRooms';
import { RoomCountList } from './counter/RoomCountList';
import { RoomSwitcher } from './counter/RoomSwitcher';
import { useCountDrafts } from './counter/useCountDrafts';

/**
 * /counter: what has been counted in every room. /counter/<roomId>: one room's counting list,
 * so each floor can bookmark its own room on a phone.
 */
export default function Counter() {
  const { locationId } = useParams();
  const { data, loading, loadError } = useStock();
  const { role, can } = useAuth();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.counter;
  const drafts = useCountDrafts(); // lives here so switching rooms keeps unsaved numbers
  const room = data.locations.find((l) => l.id === locationId);

  const progress = (locId: string) => {
    const counted = data.counts[date]?.[locId] ?? {};
    return data.items.filter((i) => counted[i.id] != null).length;
  };

  return (
    <>
      <PageHeader
        title={room ? room.name : tx.title}
        description={formatLongDate(date, locale)}
        actions={<DateSwitcher />}
      />

      {loadError && (
        <Alert tone="danger" title={t.common.loadFailed} className="mb-6">
          {loadError}
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-24 text-fg-muted">
          <Spinner />
        </div>
      ) : (
        <Card>
          <RoomSwitcher locationId={locationId} progress={progress} />

          {data.items.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title={tx.noItemsTitle}
              description={todayOnly(role) ? t.common.askAdmin : tx.noItemsDescription}
              action={
                !todayOnly(role) && (
                  <Link to="/stock" className={buttonVariants({ variant: 'outline' })}>
                    {tx.goToStock}
                  </Link>
                )
              }
            />
          ) : room ? (
            <RoomCountList room={room} counted={progress(room.id)} drafts={drafts} />
          ) : (
            <>
              {locationId && (
                <Alert tone="warning" className="m-5 mb-0" title={tx.roomGoneTitle}>
                  {tx.roomGoneDescription}
                </Alert>
              )}
              {data.locations.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList />}
                  title={tx.noRoomsTitle}
                  description={can('setup') ? tx.noRoomsDescription : t.common.askAdmin}
                />
              ) : (
                <AllRoomsTable progress={progress} />
              )}
            </>
          )}

          {can('setup') && <ManageRooms />}
        </Card>
      )}
    </>
  );
}
