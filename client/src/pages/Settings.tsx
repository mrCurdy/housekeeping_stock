import { DEFAULT_SALUTE_TEXT, pinSchema, SALUTE_TEXT_MAX, type PinRole } from '@app/shared';
import { Download, Printer, QrCode, KeyRound, PartyPopper } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Salute } from '@/components/Salute';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  CommitInput,
  FormField,
  Input,
  Spinner,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { ApiError, api, apiErrorMessage } from '@/lib/api';

/** /settings (admin only): the admin and worker PINs, the QR code for counting, the fireworks text. */
export default function Settings() {
  const { can } = useAuth();
  const { t } = useI18n();
  const tx = t.settings;
  if (!can('pins')) return <Navigate to="/stock" replace />;

  return (
    <>
      <PageHeader title={tx.title} description={tx.description} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-fg-muted" />
              {tx.pins.title}
            </CardTitle>
            <CardDescription>{tx.pins.description}</CardDescription>
          </CardHeader>
          <CardBody className="grid gap-8 sm:grid-cols-2">
            <PinForm role="admin" />
            <PinForm role="worker" />
          </CardBody>
        </Card>
        {can('qr') && <QrCard />}
        {can('setup') && <SaluteCard />}
      </div>
    </>
  );
}

/** New PIN + repeat for one role. Checks 4 digits and the repeat before sending. */
function PinForm({ role }: { role: PinRole }) {
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

type QrStatus = { active: false } | { active: true; createdAt: string };

/**
 * One QR code for all rooms: it opens /counter for today. The server only returns its token when
 * it is made, so the code is shown until this page is left; after that it can only be remade.
 */
function QrCard() {
  const { t, locale } = useI18n();
  const tx = t.settings.qr;
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<QrStatus>();
  const [link, setLink] = useState<{ url: string; svg: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<QrStatus>('/auth/qr').then(setStatus, (err: unknown) => {
      toast.error(apiErrorMessage(err, t));
      setStatus({ active: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const make = async () => {
    if (
      status?.active &&
      !(await confirm({
        title: tx.remakeTitle,
        description: tx.remakeDescription,
        confirmLabel: tx.remake,
      }))
    ) {
      return;
    }
    await run(async () => {
      const res = await api.post<{ token: string; createdAt: string }>('/auth/qr');
      const url = `${window.location.origin}/counter?key=${encodeURIComponent(res.token)}`;
      const { qrSvg } = await import('@/lib/qr');
      setLink({ url, svg: await qrSvg(url) });
      setStatus({ active: true, createdAt: res.createdAt });
    });
  };

  const revoke = async () => {
    if (
      !(await confirm({
        title: tx.revokeTitle,
        description: tx.revokeDescription,
        confirmLabel: tx.revoke,
      }))
    ) {
      return;
    }
    await run(async () => {
      await api.delete('/auth/qr');
      setLink(undefined);
      setStatus({ active: false });
      toast.success(tx.revoked);
    });
  };

  const since = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-fg-muted" />
          {tx.title}
        </CardTitle>
        <CardDescription>{tx.description}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {!status ? (
          <Spinner />
        ) : (
          <>
            {link ? (
              <div className="flex flex-col items-start gap-3">
                <img
                  alt={tx.image}
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(link.svg)}`}
                  className="h-56 w-56 rounded-md border border-border bg-white"
                />
                <p className="text-sm text-fg-muted">{tx.showOnce}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    leftIcon={<Printer className="h-4 w-4" />}
                    onClick={() =>
                      import('@/lib/qr').then(({ printQr }) => printQr(link.svg, tx.printTitle))
                    }
                  >
                    {tx.print}
                  </Button>
                  <Button
                    variant="outline"
                    leftIcon={<Download className="h-4 w-4" />}
                    onClick={() =>
                      import('@/lib/qr')
                        .then(({ downloadQrPng }) => downloadQrPng(link.url, 'counter-qr.png'))
                        .catch((err: unknown) => toast.error(apiErrorMessage(err, t)))
                    }
                  >
                    {tx.download}
                  </Button>
                </div>
              </div>
            ) : status.active ? (
              <p className="text-sm">
                {tx.activeSince(since(status.createdAt))}{' '}
                <span className="text-fg-muted">{tx.hiddenHint}</span>
              </p>
            ) : (
              <p className="text-sm text-fg-muted">{tx.none}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={make}>
                {status.active ? tx.remake : tx.make}
              </Button>
              {status.active && (
                <Button variant="outline" disabled={busy} onClick={revoke}>
                  {tx.revoke}
                </Button>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** The word the fireworks spell (last task of the day ticked, a room fully counted), with a preview. */
function SaluteCard() {
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
