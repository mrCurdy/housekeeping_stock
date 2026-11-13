import { KeyRound } from 'lucide-react';
import { Navigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { PinForm } from './settings/PinForm';
import { QrCard } from './settings/QrCard';
import { RoomSetupCard } from './settings/RoomSetupCard';
import { SaluteCard } from './settings/SaluteCard';

/** /settings (admin only): the admin and worker PINs, the QR code for counting, the fireworks text, the room cards' master setup. */
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
        {can('setup') && <RoomSetupCard />}
      </div>
    </>
  );
}
