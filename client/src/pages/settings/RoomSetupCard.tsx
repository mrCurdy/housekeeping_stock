import { ROOM_COLORS, roomStatusList, type RoomColor } from '@app/shared';
import { DoorOpen } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle, Select } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';
import { ROOM_COLOR_CLASSES } from '@/lib/roomColors';
import { statusName } from '../rooms/roomText';
import { CleaningThresholds } from './CleaningThresholds';
import { MasterList, type MasterRow } from './MasterList';

/**
 * The master layout every room card shares (admin, `setup`): units, statuses (name + colour),
 * room types and the general-cleaning thresholds.
 */
export function RoomSetupCard() {
  const { t } = useI18n();
  const tx = t.settings.rooms;
  const confirm = useConfirm();
  const stock = useStock();
  const { data } = stock;

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4 text-fg-muted" />
          {tx.title}
        </CardTitle>
        <CardDescription>{tx.description}</CardDescription>
      </CardHeader>
      <CardBody className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <MasterList
          title={tx.units}
          hint={tx.unitsHint}
          rows={data.roomUnits}
          fieldLabel={tx.unitName}
          addPlaceholder={tx.newUnit}
          addLabel={tx.addUnit}
          onAdd={stock.addRoomUnit}
          onRename={stock.renameRoomUnit}
          onMove={stock.moveRoomUnit}
          onRemove={async (row: MasterRow) => {
            if (await confirmed(tx.removeUnitTitle(row.name), tx.removeUnitDescription)) {
              stock.removeRoomUnit(row.id);
            }
          }}
        />
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
