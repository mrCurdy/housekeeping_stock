import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { cn } from '@/lib/cn';

export function Legend() {
  const { data } = useStock();
  const { t } = useI18n();
  const entries = [
    { color: 'bg-success', label: t.stock.legend.calculated },
    { color: 'bg-warning', label: t.stock.legend.manual },
    data.locations.length > 0 && { color: 'bg-primary', label: t.stock.legend.rooms },
    data.items.length > 0 && { color: 'bg-danger', label: t.stock.legend.shortage },
  ].filter((e) => !!e);
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-fg-muted">
      {entries.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-2">
          <span className={cn('h-3 w-3 rounded-sm', color)} />
          {label}
        </div>
      ))}
    </div>
  );
}
