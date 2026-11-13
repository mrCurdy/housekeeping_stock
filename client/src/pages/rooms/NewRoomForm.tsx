import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Input, Select } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { roomExists, typeOptions } from './roomText';

/** A new room card: number and (when room types exist) a type. A taken number shows an error. */
export function NewRoomForm() {
  const { data, addRoom } = useStock();
  const { t } = useI18n();
  const tx = t.rooms;
  const [number, setNumber] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="px-5 py-4">
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = number.trim();
          if (!trimmed) return;
          if (roomExists(data.rooms, trimmed)) return setError(tx.exists(trimmed));
          setBusy(true);
          try {
            if (await addRoom({ number: trimmed, ...(type && { type }) })) {
              setNumber('');
              setError(null);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex min-w-32 flex-1 flex-col gap-1">
          <Input
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setError(null);
            }}
            placeholder={tx.number}
            aria-label={tx.number}
            maxLength={20}
            invalid={!!error}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        {data.roomTypes.length > 0 && (
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={typeOptions(data.roomTypes, tx.noType)}
            aria-label={tx.type}
            className="min-w-36 flex-1 sm:flex-none"
          />
        )}
        <Button type="submit" loading={busy} leftIcon={<Plus className="h-4 w-4" />}>
          {tx.addRoom}
        </Button>
      </form>
    </Card>
  );
}
