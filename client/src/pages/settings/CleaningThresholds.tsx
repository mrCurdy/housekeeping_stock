import { cleanThresholds } from '@app/shared';
import { useState, type FormEvent } from 'react';
import { Button, FormField, Input } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';

/** Whole days 0…3650 (the server's limit), or undefined. */
const readDays = (text: string): number | undefined => {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 3650 ? n : undefined;
};

/**
 * The general-cleaning colours: green up to N days, yellow up to M, red after. Both are checked
 * together (0 ≤ green < yellow) before anything is saved.
 */
export function CleaningThresholds() {
  const { data } = useStock();
  const { green, yellow } = cleanThresholds(data.settings);
  // Remounts when the stored pair changes (load, another device), so the fields follow it
  return <ThresholdsForm key={`${green}-${yellow}`} green={green} yellow={yellow} />;
}

function ThresholdsForm({ green, yellow }: { green: number; yellow: number }) {
  const { t } = useI18n();
  const tx = t.settings.rooms;
  const { updateSettings } = useStock();
  const toast = useToast();
  const [values, setValues] = useState({ green: String(green), yellow: String(yellow) });
  const [errors, setErrors] = useState<{ green?: string; yellow?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = readDays(values.green);
    const y = readDays(values.yellow);
    if (g === undefined || y === undefined) {
      return setErrors({
        ...(g === undefined && { green: tx.wholeDays }),
        ...(y === undefined && { yellow: tx.wholeDays }),
      });
    }
    if (g >= y) return setErrors({ green: tx.greenBelowYellow });
    setErrors({});
    updateSettings({ cleanGreenDays: g, cleanYellowDays: y });
    toast.success(tx.thresholdsSaved);
  };

  const field = {
    type: 'number',
    inputMode: 'numeric',
    min: 0,
    step: 1,
    className: 'w-28',
  } as const;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div>
        <h4 className="font-semibold">{tx.cleaning}</h4>
        <p className="text-sm text-fg-muted">{tx.cleaningHint}</p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <FormField label={tx.greenDays} error={errors.green}>
          <Input
            {...field}
            value={values.green}
            invalid={!!errors.green}
            onChange={(e) => setValues((v) => ({ ...v, green: e.target.value }))}
          />
        </FormField>
        <FormField label={tx.yellowDays} error={errors.yellow}>
          <Input
            {...field}
            value={values.yellow}
            invalid={!!errors.yellow}
            onChange={(e) => setValues((v) => ({ ...v, yellow: e.target.value }))}
          />
        </FormField>
      </div>
      <div>
        <Button type="submit" variant="outline">
          {tx.saveThresholds}
        </Button>
      </div>
    </form>
  );
}
