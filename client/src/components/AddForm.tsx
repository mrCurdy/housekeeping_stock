import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

/** "New thing" text field + Add button. Clears itself after a successful add. */
export function AddForm({
  placeholder,
  label,
  onAdd,
  className,
}: {
  placeholder: string;
  label: string;
  onAdd: (name: string) => unknown;
  className?: string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={cn('flex gap-2', className)}
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        try {
          if (await onAdd(trimmed)) setName('');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <Button
        type="submit"
        variant="outline"
        loading={busy}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        {label}
      </Button>
    </form>
  );
}
