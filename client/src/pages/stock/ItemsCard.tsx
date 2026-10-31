import { Package, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { AddForm } from '@/components/AddForm';
import { ClearableInput } from '@/components/ClearableInput';
import {
  Button,
  Card,
  CommitInput,
  EmptyState,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/cn';
import { parseNumber, parseQty } from '@/lib/numbers';
import { useRoomStatus } from './useRoomStatus';
import { StockCardHeader } from './StockCardHeader';

/** Consumption, income and end-of-day stock of every item on the selected day. */
export function ItemsCard({ grip }: { grip?: ReactNode }) {
  const { data, math, patchRecord, updateItem, removeItem, addItem, addGroup } = useStock();
  const { date } = useSelectedDate();
  const confirm = useConfirm();
  const toast = useToast();
  const { t, locale } = useI18n();
  const tx = t.stock.items;
  const roomStatus = useRoomStatus();
  const setup = useAuth().can('setup');

  /** Saves one typed figure; `parse` decides what is a valid number. */
  const save =
    (itemId: string, field: 'i' | 'm' | 'mc', parse: (t: string) => number | null | undefined) =>
    (text: string) => {
      const value = parse(text);
      if (value === undefined) return toast.error(t.common.enterNumber);
      patchRecord(itemId, date, { [field]: value });
    };

  return (
    <Card>
      <StockCardHeader
        title={tx.title}
        description={tx.description(formatLongDate(date, locale))}
        grip={grip}
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title={tx.emptyTitle}
          description={setup ? tx.emptyDescription : t.common.askAdmin}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>{t.common.stockName}</Th>
              <Th className="w-32 text-right">{tx.consumption}</Th>
              <Th className="w-28 text-right">{tx.income}</Th>
              <Th className="w-32 text-right">{tx.total}</Th>
              {setup && <Th className="w-12" />}
            </tr>
          </THead>
          <TBody>
            {data.items.map((item) => {
              const rec = data.records[item.id]?.[date];
              const rooms = roomStatus(item.id, date);
              return (
                <Tr key={item.id}>
                  <Td className="py-2">
                    {setup ? (
                      <CommitInput
                        value={item.name}
                        onCommit={(name) => updateItem(item.id, { name: name.trim() })}
                        placeholder={t.common.stockName}
                        aria-label={t.common.stockName}
                        className="h-9 min-w-36"
                      />
                    ) : (
                      <span className="font-medium">{item.name || t.common.unnamedItem}</span>
                    )}
                  </Td>
                  <Td className="py-2">
                    <ClearableInput
                      type="number"
                      inputMode="decimal"
                      title={tx.consumptionHint}
                      aria-label={tx.consumptionOf(item.name)}
                      className={cn(
                        'h-9 text-right font-medium',
                        rec?.mc != null ? 'val-manual' : 'val-calc',
                      )}
                      value={rec?.mc ?? math.autoConsumption(item, date) + (rec?.c ?? 0)}
                      onCommit={save(item.id, 'mc', parseNumber)}
                      onClear={
                        rec?.mc != null ? () => patchRecord(item.id, date, { mc: null }) : undefined
                      }
                    />
                  </Td>
                  <Td className="py-2">
                    <CommitInput
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={tx.incomeOf(item.name)}
                      className="no-spin h-9 text-right"
                      value={rec?.i}
                      onCommit={save(item.id, 'i', parseQty)}
                    />
                  </Td>
                  <Td className="py-2">
                    <ClearableInput
                      type="number"
                      inputMode="decimal"
                      title={tx.totalHint}
                      aria-label={tx.totalOf(item.name)}
                      className={cn(
                        'h-9 text-right font-semibold',
                        rec?.m != null ? 'val-manual' : rooms ? 'val-rooms' : 'val-calc',
                      )}
                      value={math.calculateTotal(item.id, date)}
                      onCommit={save(item.id, 'm', parseNumber)}
                      onClear={
                        rec?.m != null ? () => patchRecord(item.id, date, { m: null }) : undefined
                      }
                    />
                    {rooms && (
                      <div
                        className="mt-1 cursor-help text-center text-[0.6875rem] text-primary"
                        title={rooms.title}
                      >
                        {rooms.label}
                      </div>
                    )}
                  </Td>
                  {setup && (
                    <Td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={tx.removeItem}
                        aria-label={tx.removeItemNamed(item.name)}
                        className="text-fg-muted hover:text-danger"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: tx.removeTitle(item.name),
                              description: tx.removeDescription,
                              confirmLabel: t.common.remove,
                            })
                          ) {
                            removeItem(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {setup && (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          <AddForm placeholder={tx.newItem} label={tx.addItem} onAdd={addItem} />
          {data.groups.length === 0 && (
            <Button
              variant="outline"
              block
              className="border-dashed"
              onClick={() => addGroup(tx.defaultGroupName)}
            >
              {tx.setUpGroups}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
