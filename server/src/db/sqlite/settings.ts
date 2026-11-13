import { stockCardOrder } from '@app/shared';
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
    async update(patch) {
      return ctx.write(() => {
        if (patch.saluteText !== undefined) writeSetting('saluteText', patch.saluteText.trim());
        if (patch.cleanGreenDays !== undefined)
          writeSetting('cleanGreenDays', patch.cleanGreenDays);
        if (patch.cleanYellowDays !== undefined)
          writeSetting('cleanYellowDays', patch.cleanYellowDays);
        return readSettings();
      });
    },
  };
}
