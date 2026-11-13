import type { RolePermissions } from '@app/shared';
import { createContext } from 'react';

export interface PermissionsState {
  /** The admin's changes to the staff roles (`settings.rolePermissions`; unset = the defaults). */
  rolePermissions?: RolePermissions;
  /** false until the first `/data` load: `can` then uses the defaults, so don't redirect yet. */
  ready: boolean;
}

/**
 * Filled by `StockProvider` from the dataset (so the 15 s poll picks up changes) and read by
 * `useAuth().can`. Its own file because `StockProvider` sits inside `AuthProvider`. Outside a
 * `StockProvider` the defaults apply.
 */
export const PermissionsContext = createContext<PermissionsState>({ ready: true });
