import { DEFAULT_SALUTE_TEXT, SALUTE_TEXT_MAX } from '@app/shared';
import { PartyPopper } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Salute } from '@/components/Salute';
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  CommitInput,
  FormField,
} from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';

/** The word the fireworks spell (last task of the day ticked, a room fully counted), with a preview. */
export function SaluteCard() {
  const { t } = useI18n();
  const tx = t.settings.salute;
  const { data, updateSettings } = useStock();
  const [preview, setPreview] = useState(false);
  const endPreview = useCallback(() => setPreview(false), []);
  const text = data.settings.saluteText ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-fg-muted" />
          {tx.title}
        </CardTitle>
        <CardDescription>{tx.description}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-wrap items-end gap-3">
        <FormField label={tx.text} hint={tx.hint(DEFAULT_SALUTE_TEXT)} className="w-full sm:w-64">
          <CommitInput
            value={text}
            maxLength={SALUTE_TEXT_MAX}
            placeholder={DEFAULT_SALUTE_TEXT}
            onCommit={(value) => {
              if (value.trim() !== text) updateSettings({ saluteText: value });
            }}
          />
        </FormField>
        <Button variant="outline" onClick={() => setPreview(true)} className="sm:mb-6">
          {tx.preview}
        </Button>
      </CardBody>
      {preview && <Salute text={text || DEFAULT_SALUTE_TEXT} onDone={endPreview} />}
    </Card>
  );
}
