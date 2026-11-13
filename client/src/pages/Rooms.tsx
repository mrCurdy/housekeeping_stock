import { DoorOpen, LayoutList, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, Button, buttonVariants, Card, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { RoomCard } from './rooms/RoomCard';
import { RoomFilters } from './rooms/RoomFilters';
import { RoomSearch } from './rooms/RoomSearch';
import { roomLevels, viewRooms } from './rooms/roomView';
import { useRoomView } from './rooms/useRoomView';

/**
 * /rooms: one card per hotel room (level by level) with its unit statuses and last general
 * cleaning, under a search and a filter bar (level, sort, hide-green; `rooms/roomView.ts`). Rooms
 * are added, and units, statuses, types and thresholds set up, by the admin in Settings.
 */
export default function Rooms() {
  const { data, loading, loadError, reload } = useStock();
  const { can } = useAuth();
  const { t } = useI18n();
  const tx = t.rooms;
  const settingsLink = can('setup') && (
    <Link to="/settings" className={buttonVariants({ variant: 'outline' })}>
      {tx.openSettings}
    </Link>
  );
  const levels = roomLevels(data.rooms);
  const [view, setView] = useRoomView(levels);
  const [search, setSearch] = useState('');

  if (!can('rooms')) return <Navigate to="/stock" replace />;
  const rooms = viewRooms(data, { ...view, search });

  return (
    <>
      <PageHeader title={tx.title} description={tx.description} />

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
          {data.roomUnits.length === 0 && (
            <Card>
              <EmptyState
                icon={<LayoutList />}
                title={tx.noUnits}
                description={can('setup') ? tx.noUnitsHint : t.common.askAdmin}
                action={settingsLink}
              />
            </Card>
          )}

          {data.rooms.length > 0 && <RoomSearch value={search} onChange={setSearch} />}
          {data.rooms.length > 0 && (
            <RoomFilters
              levels={levels}
              view={view}
              onChange={setView}
              showHideGreen={data.roomUnits.length > 0}
            />
          )}

          {data.rooms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<DoorOpen />}
                title={tx.empty}
                description={can('setup') ? tx.emptyHint : t.common.askAdmin}
                action={data.roomUnits.length > 0 && settingsLink}
              />
            </Card>
          ) : rooms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SearchX />}
                title={tx.filter.noMatch}
                description={tx.filter.noMatchHint}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setView({ level: null, hideGreen: false });
                      setSearch('');
                    }}
                  >
                    {tx.filter.showAll}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
