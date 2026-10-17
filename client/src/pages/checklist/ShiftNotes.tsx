import { addDays, formatDate, parseDateLocal } from '@app/shared';
import { MessageSquare } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CommitTextarea } from '@/components/ui';
import { formatLongDate, useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';

/** The previous day's note (read-only), then this day's note for the next shift. */
export function ShiftNotes() {
  const { data, setNote } = useStock();
  const { date } = useSelectedDate();
  const { t, locale } = useI18n();
  const tx = t.checklist.notes;
  const prevDate = formatDate(addDays(parseDateLocal(date), -1));
  const prevNote = data.notes[prevDate];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-fg-muted" />
          {tx.title}
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {prevNote && (
          <div className="rounded-md border border-border bg-surface-2 px-4 py-3">
            <p className="mb-1 text-xs font-semibold text-fg-muted">
              {tx.previous(formatLongDate(prevDate, locale))}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{prevNote}</p>
          </div>
        )}
        <div>
          {/* key: a new day gets a fresh field (an unsaved draft is saved on unmount) */}
          <CommitTextarea
            key={date}
            value={data.notes[date] ?? ''}
            onCommit={(text) => setNote(date, text)}
            placeholder={tx.placeholder}
            aria-label={tx.title}
            rows={4}
          />
          <p className="mt-1.5 text-xs text-fg-muted">{tx.hint}</p>
        </div>
      </CardBody>
    </Card>
  );
}
