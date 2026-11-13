import { Download, Printer, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';

type QrStatus = { active: false } | { active: true; createdAt: string };

/**
 * One QR code for all rooms: it opens /counter for today. The server only returns its token when
 * it is made, so the code is shown until this page is left; after that it can only be remade.
 */
export function QrCard() {
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
