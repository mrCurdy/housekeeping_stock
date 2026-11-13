import { isDefaultRolePermissions, stockCardOrder } from '@app/shared';
import type { SettingsRepo, StockCardRepo } from '../types';
import { type Ctx, createRows } from './rows';

/** The Stock page's card order. */
export function createStockCards(ctx: Ctx): StockCardRepo {
  const { writeStockCards } = createRows(ctx);
  return {
    async reorder(order) {
      return ctx.write(() => {
        const full = stockCardOrder(order);
        writeStockCards(full);
        return full;
      });
    },
  };
}

export function createSettings(ctx: Ctx): SettingsRepo {
  const { readSettings, writeSetting } = createRows(ctx);
  return {
    async read() {
      return readSettings();
    },
    async update(patch) {
      return ctx.write(() => {
        if (patch.saluteText !== undefined) writeSetting('saluteText', patch.saluteText.trim());
        if (patch.cleanGreenDays !== undefined)
          writeSetting('cleanGreenDays', patch.cleanGreenDays);
        if (patch.cleanYellowDays !== undefined)
          writeSetting('cleanYellowDays', patch.cleanYellowDays);
        if (patch.rolePermissions !== undefined) {
          const perms = patch.rolePermissions;
          writeSetting('rolePermissions', isDefaultRolePermissions(perms) ? undefined : perms);
        }
        return readSettings();
      });
    },
  };
}
