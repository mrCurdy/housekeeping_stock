import { Settings, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { AddForm } from '@/components/AddForm';
import { Button, Card, CommitInput, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { parseQty } from '@/lib/numbers';
import { StockCardHeader } from './StockCardHeader';

/** Rooms checked out on the selected day, per group. Departures × items per group = consumption. */
export function DeparturesCard({
  onEditGroup,
  grip,
}: {
  onEditGroup: (groupId: string) => void;
  grip?: ReactNode;
}) {
  const { data, setDepartures, renameGroup, removeGroup, addGroup } = useStock();
  const { date } = useSelectedDate();
  const confirm = useConfirm();
  const toast = useToast();
  const { t } = useI18n();
  const tx = t.stock.departures;
  const setup = useAuth().can('setup');

  return (
    <Card>
      <StockCardHeader title={tx.title} description={tx.description} grip={grip} />
      <Table>
        <THead>
          <tr>
            <Th>{tx.group}</Th>
            <Th className="w-28 text-right">{tx.amount}</Th>
          </tr>
        </THead>
        <TBody>
          {data.groups.map((group) => (
            <Tr key={group.id}>
              <Td className="py-2">
                {setup ? (
                  <div className="flex items-center gap-1">
                    <CommitInput
                      value={group.name}
                      onCommit={(name) => renameGroup(group.id, name.trim())}
                      placeholder={tx.groupName}
                      aria-label={tx.groupName}
                      className="h-9"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={tx.itemsPerDeparture}
                      aria-label={tx.itemsPerDepartureIn(group.name)}
                      onClick={() => onEditGroup(group.id)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={tx.removeGroup}
                      aria-label={tx.removeGroupNamed(group.name)}
                      className="text-fg-muted hover:text-danger"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: tx.removeTitle(group.name),
                            description: tx.removeDescription,
                            confirmLabel: t.common.remove,
                          })
                        ) {
                          removeGroup(group.id);
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="font-medium">{group.name}</span>
                )}
              </Td>
              <Td className="py-2">
                <CommitInput
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={tx.departuresOf(group.name)}
                  className="no-spin h-9 text-right"
                  value={data.groupRecords[group.id]?.[date]?.d}
                  onCommit={(text) => {
                    const d = parseQty(text);
                    if (d === undefined) return toast.error(t.common.enterQty);
                    setDepartures(group.id, date, d);
                  }}
                />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {setup && (
        <AddForm
          className="border-t border-border px-5 py-4"
          placeholder={tx.newGroup}
          label={t.common.add}
          onAdd={addGroup}
        />
      )}
    </Card>
  );
}
