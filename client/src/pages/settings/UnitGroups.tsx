import { unitsByGroup, type RoomUnit } from '@app/shared';
import { GripVertical, Trash2 } from 'lucide-react';
import { AddForm, Button, CommitInput } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/cn';
import { useDragSort } from '@/lib/useDragSort';
import { useUntranslated } from '@/lib/untranslated';
import { useListsDragSort } from '@/lib/useListsDragSort';

export const GRIP =
  'focus-ring flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted select-none hover:text-fg';

/**
 * The room units, group by group (Settings, `setup`): each group a box with its name (rename in
 * place), 🗑 (only an empty group; otherwise a message says to move its units first), its units
 * (rename in place, 🗑 confirmed) and "Add unit". A unit's grip drags it (mouse or touch, or ↑/↓)
 * within its group or into another one (`useListsDragSort`, as the checklist's tasks); a group's
 * grip drags the group onto another group's place (`useDragSort`, free: they sit side by side). "Add group" sits below the groups.
 */
export function UnitGroups() {
  const { t } = useI18n();
  const tx = t.settings.rooms;
  const confirm = useConfirm();
  const toast = useToast();
  const stock = useStock();
  const untranslated = useUntranslated();
  const groups = unitsByGroup(stock.data);
  const groupLabel = (name: string) => name || tx.defaultGroup;

  // Groups sit side by side on wide screens: a group is dropped on the one under the pointer
  const groupSort = useDragSort(groups.length, stock.moveRoomUnitGroup, { free: true });
  const unitSort = useListsDragSort(
    groups.map((g) => g.units.length),
    (from, to) => {
      const id = groups[from.list]!.units[from.index]!.id;
      stock.moveRoomUnit(id, groups[to.list]!.group.id, to.index);
      // A move to another group re-creates the row: keep the keyboard on its grip
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        document.querySelector<HTMLElement>(`[data-unit-grip="${id}"]`)?.focus();
      });
    },
  );

  const removeGroup = async (id: string, name: string, count: number) => {
    if (count > 0) {
      toast.info(tx.groupNotEmpty(name), tx.groupNotEmptyHint);
      return;
    }
    const ok = await confirm({
      title: tx.removeGroupTitle(name),
      description: tx.removeGroupDescription,
      confirmLabel: t.common.remove,
    });
    if (ok) stock.removeRoomUnitGroup(id);
  };

  const removeUnit = async (unit: RoomUnit) => {
    const ok = await confirm({
      title: tx.removeUnitTitle(unit.name),
      description: tx.removeUnitDescription,
      confirmLabel: t.common.remove,
    });
    if (ok) stock.removeRoomUnit(unit.id);
  };

  return (
    <section className="flex min-w-0 flex-col gap-3 lg:col-span-3">
      <div>
        <h4 className="font-semibold">{tx.units}</h4>
        <p className="text-sm text-fg-muted">{tx.unitGroupsHint}</p>
      </div>
      {groups.length === 0 && <p className="text-sm text-fg-muted">{tx.noGroups}</p>}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ group, units }, gi) => {
          const name = groupLabel(group.name);
          const dropAt = unitSort.target?.list === gi ? unitSort.target.index : null;
          return (
            <div
              key={group.id}
              role="group"
              aria-label={name}
              ref={(el) => {
                groupSort.rowRef(gi)(el);
                unitSort.listRef(gi)(el);
              }}
              style={groupSort.rowStyle(gi)}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-3',
                groupSort.dragging === gi && 'shadow-lg',
                (unitSort.target?.list === gi || groupSort.over === gi) && 'ring-2 ring-primary',
              )}
            >
              <div
                data-group-header
                className="-mx-3 -mt-3 flex items-center gap-1 rounded-t-md border-b border-border bg-surface-2 px-3 py-2"
              >
                {groups.length > 1 && (
                  <button
                    type="button"
                    title={tx.dragGroup}
                    aria-label={tx.dragGroupNamed(name)}
                    className={cn(GRIP, groupSort.dragging === gi && 'cursor-grabbing')}
                    {...groupSort.handleProps(gi)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                <CommitInput
                  value={group.name}
                  placeholder={tx.defaultGroup}
                  maxLength={100}
                  aria-label={tx.groupName(name)}
                  title={untranslated(group).title}
                  className={cn('min-w-0 flex-1 font-semibold', untranslated(group).className)}
                  confirmUnchanged={group.nameMissing}
                  onCommit={(text) => {
                    if (text.trim() && (text.trim() !== group.name || group.nameMissing)) {
                      stock.renameRoomUnitGroup(group.id, text.trim());
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void removeGroup(group.id, name, units.length)}
                  aria-label={tx.removeGroupNamed(name)}
                  title={tx.removeGroupNamed(name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {units.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {units.map((unit, i) => {
                    const dragging =
                      unitSort.dragging?.list === gi && unitSort.dragging.index === i;
                    return (
                      <li
                        key={unit.id}
                        ref={unitSort.rowRef(gi, i)}
                        style={unitSort.rowStyle(gi, i)}
                        className={cn(
                          'relative flex items-center gap-1 rounded-md bg-surface',
                          dragging && 'shadow-lg ring-1 ring-border',
                        )}
                      >
                        {(dropAt === i || (dropAt === units.length && i === units.length - 1)) && (
                          <span
                            aria-hidden
                            className={cn(
                              'pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary',
                              dropAt === i ? '-top-0.5' : '-bottom-0.5',
                            )}
                          />
                        )}
                        <button
                          type="button"
                          title={tx.dragUnit}
                          aria-label={tx.dragUnitNamed(unit.name)}
                          data-unit-grip={unit.id}
                          className={cn(GRIP, dragging && 'cursor-grabbing')}
                          {...unitSort.handleProps(gi, i)}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <CommitInput
                          value={unit.name}
                          maxLength={100}
                          aria-label={tx.unitName(unit.name)}
                          title={untranslated(unit).title}
                          className={cn('min-w-0 flex-1', untranslated(unit).className)}
                          confirmUnchanged={unit.nameMissing}
                          onCommit={(text) => {
                            if (text.trim() && (text.trim() !== unit.name || unit.nameMissing)) {
                              stock.renameRoomUnit(unit.id, text.trim());
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void removeUnit(unit)}
                          aria-label={tx.removeNamed(unit.name)}
                          title={tx.removeNamed(unit.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <AddForm
                placeholder={tx.newUnit}
                label={tx.addUnit}
                onAdd={(unitName) => stock.addRoomUnit(unitName, group.id)}
              />
            </div>
          );
        })}
      </div>
      <AddForm placeholder={tx.newGroup} label={tx.addGroup} onAdd={stock.addRoomUnitGroup} />
    </section>
  );
}
