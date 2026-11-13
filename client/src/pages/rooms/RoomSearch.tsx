import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';

/**
 * The search above the filter bar: a room number prefix (`matchesSearch` in `roomView.ts`). Phones
 * open the number keypad (`inputMode`). Not remembered; × clears it.
 */
export function RoomSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tx = useI18n().t.rooms.filter;
  return (
    <div className="relative w-full sm:max-w-sm">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && value && onChange('')}
        placeholder={tx.searchPlaceholder}
        aria-label={tx.search}
        leftIcon={<Search />}
        maxLength={100}
        autoComplete="off"
        inputMode="numeric"
        className={value ? 'pr-9' : undefined}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title={tx.searchClear}
          aria-label={tx.searchClear}
          className="focus-ring absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
