import { ROOM_COLORS, roomStatusList, type Room, type RoomColor } from '@app/shared';
import { DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { statusName } from '../rooms/roomText';
import { sortByLevel } from '../rooms/roomView';
import { RoomDialog } from './RoomDialog';
import { CleaningThresholds } from './CleaningThresholds';
import { MasterList } from './MasterList';
import { UnitGroups } from './UnitGroups';

/**
 * The master layout every room card shares (admin, `setup`): units in groups (`UnitGroups`), statuses (name + colour),
 * room types and the general-cleaning thresholds. "Add room" opens `RoomDialog`; the "Rooms" list
 * under it (level order) edits a card's number/type/note in the same dialog or removes the card
 * (confirmed). New cards are admin-only; the admin also edits them on /rooms.
 */
export function RoomSetupCard() {
  const { t } = useI18n();
  const tx = t.settings.rooms;
  const confirm = useConfirm();
  const stock = useStock();
  const { data } = stock;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const listId = useId();
  const typeName = (id?: string) => data.roomTypes.find((rt) => rt.id === id)?.name;

  const statuses = roomStatusList(data);
  const statusRows = statuses.map((s) => ({
    id: s.id,
    name: statusName(s, t.rooms.defaultStatus),
  }));
  const colorOf = (id: string): RoomColor => statuses.find((s) => s.id === id)?.color ?? 'grey';
  const colorOptions = ROOM_COLORS.map((c) => ({ value: c, label: tx.colors[c] }));
  // A new status takes the first colour no status uses yet
  const nextColor = (): RoomColor =>
    ROOM_COLORS.find((c) => !statuses.some((s) => s.color === c)) ?? 'grey';

  const confirmed = async (title: string, description: string) =>
    confirm({ title, description, confirmLabel: t.common.remove });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-fg-muted" />
            {tx.title}
          </CardTitle>
          <CardDescription>{tx.description}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setAdding(true)}
        >
          {tx.addRoom}
        </Button>
      </CardHeader>
      {adding && <RoomDialog onClose={() => setAdding(false)} />}
      {editing && <RoomDialog room={editing} onClose={() => setEditing(null)} />}
      <CardBody className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="flex min-w-0 flex-col gap-2 lg:col-span-3">
          <h4 id={listId} className="font-semibold">
            {tx.roomList}
          </h4>
          {data.rooms.length === 0 ? (
            <p className="text-sm text-fg-muted">{tx.noRooms}</p>
          ) : (
            <ul
              aria-labelledby={listId}
              className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 overflow-y-auto"
            >
              {sortByLevel(data.rooms).map((room) => (
                <li
                  key={room.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-2 py-0.5 pr-0.5 pl-3 text-sm"
                >
                  <span className="font-medium text-fg">{room.number}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">
                    {typeName(room.type)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.rooms.edit(room.number)}
                    title={t.rooms.edit(room.number)}
                    onClick={() => setEditing(room)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.rooms.remove(room.number)}
                    title={t.rooms.remove(room.number)}
                    onClick={async () => {
                      if (
                        await confirmed(t.rooms.removeTitle(room.number), t.rooms.removeDescription)
                      ) {
                        stock.removeRoom(room.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <UnitGroups />
        <MasterList
          title={tx.statuses}
          hint={tx.statusesHint}
          rows={statusRows}
          fieldLabel={tx.statusName}
          addPlaceholder={tx.newStatus}
          addLabel={tx.addStatus}
          onAdd={(name) => stock.addRoomStatus(name, nextColor())}
          onRename={(id, name) => stock.updateRoomStatus(id, { name })}
          onMove={stock.moveRoomStatus}
          removeDisabled={statuses.length <= 1 ? tx.lastStatus : undefined}
          onRemove={async (row) => {
            const first = statusRows.find((s) => s.id !== row.id)?.name ?? '';
            if (
              await confirmed(tx.removeStatusTitle(row.name), tx.removeStatusDescription(first))
            ) {
              stock.removeRoomStatus(row.id);
            }
          }}
          extra={(row) => (
            <>
              <span
                aria-hidden
                className={cn(
                  'h-3 w-3 shrink-0 rounded-full',
                  ROOM_COLOR_CLASSES[colorOf(row.id)].dot,
                )}
              />
              <Select
                value={colorOf(row.id)}
                options={colorOptions}
                aria-label={tx.statusColor(row.name)}
                className="w-28 shrink-0"
                onChange={(e) =>
                  stock.updateRoomStatus(row.id, { color: e.target.value as RoomColor })
                }
              />
            </>
          )}
        />
        <MasterList
          title={tx.types}
          hint={tx.typesHint}
          rows={data.roomTypes}
          fieldLabel={tx.typeName}
          addPlaceholder={tx.newType}
          addLabel={tx.addType}
          onAdd={stock.addRoomType}
          onRename={stock.renameRoomType}
          onMove={stock.moveRoomType}
          onRemove={async (row) => {
            if (await confirmed(tx.removeTypeTitle(row.name), tx.removeTypeDescription)) {
              stock.removeRoomType(row.id);
            }
          }}
        />
        <div className="lg:col-span-3">
          <CleaningThresholds />
        </div>
      </CardBody>
    </Card>
  );
}
