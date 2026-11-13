import { DEFAULT_SALUTE_TEXT, formatDate } from '@app/shared';
import { DoorOpen, SearchX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Salute } from '@/components/Salute';
import { Alert, Button, buttonVariants, Card, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { CleaningDialog } from './cleaning/CleaningDialog';
import { CleaningFilters } from './cleaning/CleaningFilters';
import { CleaningTile } from './cleaning/CleaningTile';
import { useCleaningView } from './cleaning/useCleaningView';
import { RoomSearch } from './rooms/RoomSearch';
import { roomLevels, viewCleaning } from './rooms/roomView';

/**
 * /cleaning (admin and worker): every room as a small square tile with the days since its latest
 * general cleaning, under the room search, the level buttons and "Dirty first"
 * (`viewCleaning` in `rooms/roomView.ts`). Tapping a tile opens `CleaningDialog`, which registers
 * a cleaning for today. Days count from the real today, not the date switcher's day.
 */
export default function Cleaning() {
  const { data, loading, loadError, reload } = useStock();
  const { can } = useAuth();
  const { t } = useI18n();
  const tx = t.cleaning;
  const levels = roomLevels(data.rooms);
  const [view, setView] = useCleaningView(levels);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [salute, setSalute] = useState(false);
  const endSalute = useCallback(() => setSalute(false), []);

  if (!can('cleaning')) return <Navigate to="/stock" replace />;
  const today = formatDate(new Date());
  const rooms = viewCleaning(data, { ...view, search }, today);
  const open = openId === null ? undefined : data.rooms.find((r) => r.id === openId);

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
      ) : data.rooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DoorOpen />}
            title={t.rooms.empty}
            description={can('setup') ? t.rooms.emptyHint : t.common.askAdmin}
            action={
              can('setup') && (
                <Link to="/settings" className={buttonVariants({ variant: 'outline' })}>
                  {t.rooms.openSettings}
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <RoomSearch value={search} onChange={setSearch} />
          <CleaningFilters levels={levels} view={view} onChange={setView} />

          {rooms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SearchX />}
                title={t.rooms.filter.noMatch}
                description={t.rooms.filter.noMatchHint}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setView({ level: null });
                      setSearch('');
                    }}
                  >
                    {t.rooms.filter.showAll}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-4 gap-2 min-[420px]:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
              {rooms.map((room) => (
                <CleaningTile
                  key={room.id}
                  room={room}
                  today={today}
                  onOpen={() => setOpenId(room.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <CleaningDialog
          room={open}
          today={today}
          onClose={() => setOpenId(null)}
          onCleaned={() => setSalute(true)}
        />
      )}
      {salute && (
        <Salute text={data.settings.saluteText || DEFAULT_SALUTE_TEXT} onDone={endSalute} />
      )}
    </>
  );
}
