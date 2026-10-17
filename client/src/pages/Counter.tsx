import { ClipboardList, Package } from 'lucide-react';
import { Link, NavLink, useParams } from 'react-router';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, buttonVariants, Card, EmptyState, Spinner } from '@/components/ui';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { AllRoomsTable } from './counter/AllRoomsTable';
import { ManageRooms } from './counter/ManageRooms';
import { RoomCountList } from './counter/RoomCountList';
import { useCountDrafts } from './counter/useCountDrafts';

/**
 * /counter: what has been counted in every room. /counter/<roomId>: one room's counting list,
 * so each floor can bookmark its own room on a phone.
 */
export default function Counter() {
  const { locationId } = useParams();
  const { data, loading, loadError } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.counter;
  const drafts = useCountDrafts(); // lives here so switching rooms keeps unsaved numbers
  const room = data.locations.find((l) => l.id === locationId);

  const progress = (locId: string) => {
    const counted = data.counts[date]?.[locId] ?? {};
    return data.items.filter((i) => counted[i.id] != null).length;
  };

  const pill = (active: boolean) =>
    cn(
      'focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
      active
        ? 'border-primary bg-primary text-primary-fg'
        : 'border-border bg-surface text-fg hover:bg-surface-2',
    );

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
          <nav className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3 scrollbar-thin">
            <NavLink to="/counter" end className={({ isActive }) => pill(isActive)}>
              {tx.allRooms}
            </NavLink>
            {data.locations.map((loc) => (
              <NavLink
                key={loc.id}
                to={`/counter/${loc.id}`}
                className={({ isActive }) => pill(isActive)}
              >
                {loc.name || t.common.unnamedRoom}
                <span className="text-xs opacity-75">
                  {progress(loc.id)}/{data.items.length}
                </span>
              </NavLink>
            ))}
          </nav>

          {data.items.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title={tx.noItemsTitle}
              description={tx.noItemsDescription}
              action={
                <Link to="/stock" className={buttonVariants({ variant: 'outline' })}>
                  {tx.goToStock}
                </Link>
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
                  description={tx.noRoomsDescription}
                />
              ) : (
                <AllRoomsTable progress={progress} />
              )}
            </>
          )}

          <ManageRooms />
        </Card>
      )}
    </>
  );
}
