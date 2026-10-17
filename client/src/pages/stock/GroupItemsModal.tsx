import { CommitInput, EmptyState, Modal } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { parseQty } from '@/lib/numbers';

/** How many of each item one departure of a group uses. */
export function GroupItemsModal({
  groupId,
  onClose,
}: {
  groupId: string | null;
  onClose: () => void;
}) {
  const { data, updateItem } = useStock();
  const toast = useToast();
  const { t } = useI18n();
  const group = data.groups.find((g) => g.id === groupId);

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title={t.stock.groupItems.title(group?.name ?? '')}
      description={t.stock.groupItems.description}
    >
      {group && data.items.length === 0 && <EmptyState title={t.stock.groupItems.empty} />}
      <div className="flex flex-col gap-2">
        {group &&
          data.items.map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{item.name || t.common.unnamedItem}</span>
              <CommitInput
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                className="no-spin h-9 w-24 text-right"
                value={item.multipliers[group.id]}
                onCommit={(text) => {
                  const qty = parseQty(text);
                  if (qty === undefined) return toast.error(t.common.enterQty);
                  updateItem(item.id, { multipliers: { [group.id]: qty } });
                }}
              />
            </label>
          ))}
      </div>
    </Modal>
  );
}
