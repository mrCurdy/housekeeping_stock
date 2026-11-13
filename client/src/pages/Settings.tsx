import { PIN_ROLES } from '@app/shared';
import { KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { DataCard } from './settings/DataCard';
import { PinForm } from './settings/PinForm';
import { QrCard } from './settings/QrCard';
import { RolesCard } from './settings/RolesCard';
import { RoomSetupCard } from './settings/RoomSetupCard';
import { SaluteCard } from './settings/SaluteCard';

/** /settings (admin only; `AppShell` redirects anyone else): the admin, housekeeper and reception PINs, what those two roles may do, the QR code for counting, Excel/Backup/Restore, the fireworks text, the room cards' master setup. */
export default function Settings() {
  const { can } = useAuth();
  const { t } = useI18n();
  const tx = t.settings;

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
          <CardBody className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {PIN_ROLES.map((role) => (
              <PinForm key={role} role={role} />
            ))}
          </CardBody>
        </Card>
        {can('pins') && <RolesCard />}
        {can('qr') && <QrCard />}
        <DataCard />
        {can('setup') && <SaluteCard />}
        {can('setup') && <RoomSetupCard />}
      </div>
    </>
  );
}
