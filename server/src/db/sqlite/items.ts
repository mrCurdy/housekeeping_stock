import { randomUUID } from 'node:crypto';
import type { Group, Item, Location } from '@app/shared';
import type { ItemRepo, NamedRepo } from '../types';
import { type Ctx, createRows, namedRepo } from './rows';

export function createItems(ctx: Ctx): ItemRepo {
  const { run, write } = ctx;
  const { nextPos, hasItem, readItem } = createRows(ctx);
  return {
    async create(name) {
      return write(() => {
        const item: Item = { id: randomUUID(), name, multipliers: {} };
        run('INSERT INTO items (id, name, pos) VALUES (?, ?, ?)', item.id, name, nextPos('items'));
        return item;
      });
    },
    async delete(id) {
      return write(() => {
        if (!run('DELETE FROM items WHERE id = ?', id).changes) return false;
        for (const t of ['multipliers', 'records', 'counts']) {
          run(`DELETE FROM ${t} WHERE item_id = ?`, id);
        }
        return true;
      });
    },
    async update(id, patch) {
      return write(() => {
        if (!hasItem(id)) return null;
        if (patch.name !== undefined) run('UPDATE items SET name = ? WHERE id = ?', patch.name, id);
        for (const [groupId, qty] of Object.entries(patch.multipliers ?? {})) {
          if (qty) {
            run(
              `INSERT INTO multipliers (item_id, group_id, qty) VALUES (?, ?, ?)
               ON CONFLICT (item_id, group_id) DO UPDATE SET qty = excluded.qty`,
              id,
              groupId,
              qty,
            );
          } else run('DELETE FROM multipliers WHERE item_id = ? AND group_id = ?', id, groupId);
        }
        return readItem(id);
      });
    },
  };
}

export const createGroups = (ctx: Ctx): NamedRepo<Group> =>
  namedRepo<Group>(ctx, 'groups', (id) => {
    ctx.run('DELETE FROM departures WHERE group_id = ?', id);
    ctx.run('DELETE FROM multipliers WHERE group_id = ?', id);
  });

export const createLocations = (ctx: Ctx): NamedRepo<Location> =>
  namedRepo<Location>(ctx, 'locations', () => {});
