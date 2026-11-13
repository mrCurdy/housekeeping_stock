import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { AddForm, Button, CommitInput } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';

/** One row of a master list: its id and the name shown (and edited) in the field. */
export interface MasterRow {
  id: string;
  name: string;
}

/**
 * An ordered list of names (room statuses, room types): rename in place, ↑/↓ to reorder,
 * remove, and the "new name" line under it. `extra` adds controls before a row's name (the
 * status colour); `removeDisabled` gives the reason a row can't be removed.
 */
export function MasterList({
  title,
  hint,
  rows,
  fieldLabel,
  addPlaceholder,
  addLabel,
  onAdd,
  onRename,
  onMove,
  onRemove,
  extra,
  removeDisabled,
}: {
  title: string;
  hint: string;
  rows: MasterRow[];
  fieldLabel: (name: string) => string;
  addPlaceholder: string;
  addLabel: string;
  onAdd: (name: string) => unknown;
  onRename: (id: string, name: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (row: MasterRow) => void;
  extra?: (row: MasterRow) => ReactNode;
  removeDisabled?: string;
}) {
  const { t } = useI18n();
  const tx = t.settings.rooms;
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-fg-muted">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{tx.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={row.id} className="flex items-center gap-1">
              {extra?.(row)}
              <CommitInput
                value={row.name}
                maxLength={100}
                aria-label={fieldLabel(row.name)}
                className="min-w-0 flex-1"
                onCommit={(text) => {
                  if (text.trim() && text.trim() !== row.name) onRename(row.id, text.trim());
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={i === 0}
                onClick={() => onMove(i, i - 1)}
                aria-label={tx.moveUp(row.name)}
                title={tx.moveUp(row.name)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={i === rows.length - 1}
                onClick={() => onMove(i, i + 1)}
                aria-label={tx.moveDown(row.name)}
                title={tx.moveDown(row.name)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!!removeDisabled}
                onClick={() => onRemove(row)}
                aria-label={tx.removeNamed(row.name)}
                title={removeDisabled ?? tx.removeNamed(row.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AddForm placeholder={addPlaceholder} label={addLabel} onAdd={onAdd} />
    </section>
  );
}
