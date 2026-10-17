import { Boxes, Delete } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { ApiError, apiErrorMessage } from '@/lib/api';

const LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface LoginProps {
  /** Logs in; throws ApiError (401 = wrong PIN, 429 = too many tries). */
  onSubmit(pin: string): Promise<void>;
  /** A message from before the screen opened (an expired QR code, no connection). */
  notice?: string;
}

/**
 * The PIN screen: a keypad, plus a numeric field for typing. It submits as soon as the 4th digit is
 * entered and clears the PIN on a wrong one.
 */
export default function Login({ onSubmit, notice }: LoginProps) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const change = async (next: string) => {
    next = next.replace(/\D/g, '').slice(0, LENGTH);
    setPin(next);
    if (next.length > 0) setError(undefined);
    if (next.length < LENGTH) return;
    setBusy(true);
    try {
      await onSubmit(next); // on success this screen unmounts
    } catch (err) {
      setPin('');
      setBusy(false);
      setError(
        err instanceof ApiError && err.status === 401 ? t.auth.wrongPin : apiErrorMessage(err, t),
      );
      input.current?.focus();
    }
  };

  const message = error ?? (pin === '' ? notice : undefined);

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg">
            <Boxes className="h-4 w-4" />
          </span>
          {t.appName}
        </div>
        <h1 className="text-lg font-semibold">{t.auth.title}</h1>

        <input
          ref={input}
          aria-label={t.auth.pin}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          maxLength={LENGTH}
          value={pin}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
          className="focus-ring h-12 w-40 rounded-md border border-border bg-surface text-center text-2xl tracking-[0.5em]"
        />

        {message && (
          <Alert tone="danger" className="w-full">
            {message}
          </Alert>
        )}

        <div className="grid w-full grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <Key key={k} label={k} disabled={busy} onClick={() => change(pin + k)} />
          ))}
          <span />
          <Key label="0" disabled={busy} onClick={() => change(pin + '0')} />
          <Button
            variant="ghost"
            size="lg"
            aria-label={t.auth.clear}
            disabled={busy || pin === ''}
            onClick={() => setPin(pin.slice(0, -1))}
          >
            <Delete className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Key({ label, disabled, onClick }: { label: string; disabled: boolean; onClick(): void }) {
  return (
    <Button variant="outline" size="lg" className="text-xl" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}
