import type { Location } from '@app/shared';
import { useRef, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { ApiError, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { parseQty } from '@/lib/numbers';
import { countKey, type CountDrafts, type CountState } from './useCountDrafts';

const rowTone: Record<CountState, string> = {
  empty: 'border-l-transparent',
  draft: 'border-l-warning bg-warning-soft',
  saving: 'border-l-warning',
  saved: 'border-l-success',
  error: 'border-l-danger bg-danger-soft',
};

/** One room's list: type a number, Save (or Enter) stores it and jumps to the next item. */
export function RoomCountList({
  room,
  counted,
  drafts,
}: {
  room: Location;
  counted: number;
  drafts: CountDrafts;
}) {
  const { data, setCount } = useStock();
  const { date } = useSelectedDate();
  const { t } = useI18n();
  const tx = t.counter;
  const [error, setError] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const total = data.items.length;

  const submit = async (index: number) => {
    const item = data.items[index]!;
    const key = countKey(date, room.id, item.id);
    const value = parseQty(drafts.text(key));
    if (value === undefined) {
      setError(tx.invalid);
      return;
    }
    drafts.setStatus(key, 'saving');
    try {
      await setCount(date, room.id, item.id, value);
      drafts.clearDraft(key);
      drafts.setStatus(key, null);
      setError('');
      const next = inputs.current[index + 1];
      if (next) {
        next.focus();
      } else {
        inputs.current[index]?.blur();
      }
    } catch (err) {
      drafts.setStatus(key, 'error');
      setError(err instanceof ApiError ? tx.serverError(apiErrorMessage(err, t)) : tx.offline);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-sm text-fg-muted">
          {tx.howTo.before} <strong className="text-fg">{tx.button.empty}</strong> {tx.howTo.after}
        </p>
        <div>
          <div className="mb-1.5 flex justify-between text-sm">
            <strong>{room.name}</strong>
            <span className="text-fg-muted">{tx.progress(counted, total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${(100 * counted) / total}%` }}
            />
          </div>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>

      <ul className="border-t border-border">
        {data.items.map((item, index) => {
          const key = countKey(date, room.id, item.id);
          const state = drafts.state(key);
          const id = `count-${item.id}`;
          return (
            <li
              key={item.id}
              className={cn(
                'flex scroll-mt-32 flex-col gap-2 border-b border-l-4 border-border px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
                rowTone[state],
              )}
            >
              <label htmlFor={id} className="font-medium">
                {item.name || t.common.unnamedItem}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="—"
                  enterKeyHint={index === data.items.length - 1 ? 'done' : 'next'}
                  className="no-spin h-12 flex-1 text-lg font-semibold sm:w-28 sm:flex-none"
                  value={drafts.text(key)}
                  onChange={(e) => drafts.setText(key, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submit(index);
                    }
                  }}
                />
                <Button
                  size="lg"
                  className="min-w-28"
                  variant={
                    state === 'saved' ? 'secondary' : state === 'error' ? 'danger' : 'primary'
                  }
                  disabled={state === 'saving' || state === 'saved' || state === 'empty'}
                  onClick={() => void submit(index)}
                >
                  {tx.button[state]}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
