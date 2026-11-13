import { pinSchema, type PinRole } from '@app/shared';
import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, FormField, Input } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useToast } from '@/context/ToastContext';
import { ApiError, api, apiErrorMessage } from '@/lib/api';

/** New PIN + repeat for one role. Checks 4 digits and the repeat before sending. */
export function PinForm({ role }: { role: PinRole }) {
  const { t } = useI18n();
  const tx = t.settings.pins;
  const toast = useToast();
  const titleId = useId();
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<{ pin?: string; repeat?: string; server?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pinSchema.safeParse(pin).success) return setErrors({ pin: tx.useDigits });
    if (repeat !== pin) return setErrors({ repeat: tx.mismatch });
    setErrors({});
    setBusy(true);
    try {
      await api.put('/auth/pins', { role, pin });
      setPin('');
      setRepeat('');
      toast.success(role === 'admin' ? tx.adminChanged : tx.workerChanged);
    } catch (err) {
      setErrors({
        server:
          err instanceof ApiError && err.code === 'BAD_REQUEST'
            ? tx.mustDiffer
            : apiErrorMessage(err, t),
      });
    } finally {
      setBusy(false);
    }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);
  const field = {
    type: 'password',
    inputMode: 'numeric',
    autoComplete: 'new-password',
    maxLength: 4,
    className: 'w-32 tracking-[0.3em]',
  } as const;

  return (
    <form aria-labelledby={titleId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <h4 id={titleId} className="font-semibold">
          {role === 'admin' ? tx.admin : tx.worker}
        </h4>
        <p className="text-sm text-fg-muted">{role === 'admin' ? tx.adminHint : tx.workerHint}</p>
      </div>
      <FormField label={tx.newPin} error={errors.pin}>
        <Input {...field} value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </FormField>
      <FormField label={tx.repeat} error={errors.repeat}>
        <Input {...field} value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} />
      </FormField>
      {errors.server && <Alert tone="danger">{errors.server}</Alert>}
      <div>
        <Button type="submit" loading={busy}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}
