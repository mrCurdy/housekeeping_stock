import { X } from 'lucide-react';
import { CommitInput, type CommitInputProps } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/cn';

/** A CommitInput with a small × that clears a manual override. */
export function ClearableInput({
  onClear,
  className,
  ...props
}: CommitInputProps & { onClear?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <CommitInput className={cn('no-spin', onClear && 'pr-7', className)} {...props} />
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          title={t.common.clearManual}
          aria-label={t.common.clearManual}
          className="focus-ring absolute inset-y-0 right-1 my-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
