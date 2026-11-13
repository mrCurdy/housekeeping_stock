import {
  DEFAULT_ROLE_PERMISSIONS,
  isDefaultRolePermissions,
  STAFF_PERMISSIONS,
  STAFF_ROLES,
  type RolePermissions,
  type StaffPermission,
  type StaffRole,
} from '@app/shared';
import { RotateCcw, Users } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';

/**
 * What the housekeeper and reception may do (`settings.rolePermissions`): rows = the four staff
 * permissions, columns = the two roles. Every tick saves at once; the server guards follow it.
 */
export function RolesCard() {
  const { t } = useI18n();
  const tx = t.settings.roles;
  const { data, updateSettings } = useStock();
  const perms: RolePermissions = data.settings.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS;

  const toggle = (role: StaffRole, perm: StaffPermission, on: boolean) => {
    const list = on ? [...perms[role], perm] : perms[role].filter((p) => p !== perm);
    const next = { ...perms, [role]: STAFF_PERMISSIONS.filter((p) => list.includes(p)) };
    updateSettings({ rolePermissions: next });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-fg-muted" />
          {tx.title}
        </CardTitle>
        <CardDescription>{tx.description}</CardDescription>
      </CardHeader>
      <CardBody className="p-0">
        <Table>
          <THead>
            <Tr>
              <Th className="px-3 sm:px-4">{tx.permission}</Th>
              {STAFF_ROLES.map((role) => (
                <Th key={role} className="w-0 px-2 text-center whitespace-nowrap sm:px-4">
                  {tx.role[role]}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {STAFF_PERMISSIONS.map((perm) => (
              <Tr key={perm}>
                <Td className="px-3 sm:px-4">
                  <div className="font-medium">{tx.perm[perm].name}</div>
                  <div className="text-xs text-fg-muted">{tx.perm[perm].hint}</div>
                </Td>
                {STAFF_ROLES.map((role) => (
                  <Td key={role} className="px-2 text-center sm:px-4">
                    <input
                      type="checkbox"
                      aria-label={tx.toggle(tx.perm[perm].name, tx.role[role])}
                      className="focus-ring h-5 w-5 cursor-pointer rounded border-border accent-primary"
                      checked={perms[role].includes(perm)}
                      onChange={(e) => toggle(role, perm, e.target.checked)}
                    />
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </CardBody>
      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RotateCcw className="h-4 w-4" />}
          disabled={isDefaultRolePermissions(perms)}
          onClick={() => updateSettings({ rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS } })}
        >
          {tx.reset}
        </Button>
      </CardFooter>
    </Card>
  );
}
