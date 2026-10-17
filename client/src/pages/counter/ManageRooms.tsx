import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { AddForm } from '@/components/AddForm';
import { Button, CommitInput } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';

/** Add, rename and remove the rooms where stock is counted. */
export function ManageRooms() {
  const { data, addLocation, renameLocation, removeLocation } = useStock();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { t } = useI18n();
  const tx = t.counter;

  return (
    <details className="border-t border-border px-5 py-3">
      <summary className="cursor-pointer py-1 text-sm font-semibold text-fg-muted">
        {tx.manageRooms}
      </summary>
      <div className="mt-3 flex max-w-lg flex-col gap-2">
        {data.locations.map((loc) => (
          <div key={loc.id} className="flex items-center gap-2">
            <CommitInput
              value={loc.name}
              onCommit={(name) => renameLocation(loc.id, name.trim())}
              placeholder={tx.roomName}
              aria-label={tx.roomName}
            />
            <Button
              variant="ghost"
              size="icon"
              title={tx.removeRoom}
              aria-label={tx.removeRoomNamed(loc.name)}
              className="text-fg-muted hover:text-danger"
              onClick={async () => {
                if (
                  await confirm({
                    title: tx.removeTitle(loc.name),
                    description: tx.removeDescription,
                    confirmLabel: t.common.remove,
                  })
                ) {
                  removeLocation(loc.id);
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <AddForm
          placeholder={tx.newRoom}
          label={tx.addRoom}
          onAdd={async (name) => {
            const loc = await addLocation(name);
            if (loc) navigate(`/counter/${loc.id}`);
            return loc;
          }}
        />
      </div>
    </details>
  );
}
