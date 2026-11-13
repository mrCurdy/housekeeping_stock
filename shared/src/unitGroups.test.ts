import { describe, expect, it } from 'vitest';
import { localizeNames } from './names';
import {
  applyUnitMove,
  moveUnitTo,
  removeUnitGroupIn,
  unitGroupList,
  unitGroupOf,
  unitsByGroup,
} from './rooms';
import { backupSchema, roomUnitCreateSchema, unitOrderSchema } from './schemas';
import { DEFAULT_UNIT_GROUP_ID, emptyStockData, type StockData } from './types';

const groups = [
  { id: 'bath', name: 'Bathroom' },
  { id: 'tech', name: 'Electronics' },
];
const units = [
  { id: 'faucet', name: 'Faucet', group: 'bath' },
  { id: 'tv', name: 'TV', group: 'tech' },
  { id: 'shower', name: 'Shower', group: 'bath' },
];
const data = (): StockData => ({
  ...emptyStockData(),
  roomUnitGroups: structuredClone(groups),
  roomUnits: structuredClone(units),
});
const ids = (d: StockData) =>
  unitsByGroup(d).map((g) => [g.group.id, g.units.map((u) => u.id)] as const);

describe('room unit groups', () => {
  it('lists the units per group, in order', () => {
    expect(ids(data())).toEqual([
      ['bath', ['faucet', 'shower']],
      ['tech', ['tv']],
    ]);
  });

  it('a unit without a known group is in the default group, added while needed', () => {
    const old = { ...emptyStockData(), roomUnits: [{ id: 'u', name: 'Bed' }] };
    expect(unitGroupList(old)).toEqual([{ id: DEFAULT_UNIT_GROUP_ID, name: '' }]);
    expect(unitGroupOf({ group: 'gone' }, groups)).toBe(DEFAULT_UNIT_GROUP_ID);
    expect(unitGroupList(emptyStockData())).toEqual([]);
    expect(unitGroupList(data())).toEqual(groups);
  });

  it('moves a unit within its group and into another one', () => {
    const d = data();
    const down = moveUnitTo(d, 'faucet', 'bath', 1)!;
    expect(down).toEqual({ ids: ['tv', 'shower', 'faucet'], group: 'bath' });
    applyUnitMove(d, 'faucet', down);
    expect(ids(d)[0]).toEqual(['bath', ['shower', 'faucet']]);

    const across = moveUnitTo(d, 'faucet', 'tech', 0)!;
    applyUnitMove(d, 'faucet', across);
    expect(ids(d)).toEqual([
      ['bath', ['shower']],
      ['tech', ['faucet', 'tv']],
    ]);
    expect(moveUnitTo(d, 'faucet', 'tech', 0)).toBeNull(); // already there
    expect(moveUnitTo(d, 'faucet', 'nope', 0)).toBeNull();
    expect(moveUnitTo(d, 'faucet', 'bath', 5)).toBeNull();
  });

  it('a group with units is not removed', () => {
    const d = data();
    expect(removeUnitGroupIn(d, 'tech')).toBe('notEmpty');
    d.roomUnits = d.roomUnits.filter((u) => u.group !== 'tech');
    expect(removeUnitGroupIn(d, 'tech')).toBe(true);
    expect(d.roomUnitGroups).toEqual([groups[0]]);
    expect(removeUnitGroupIn(d, 'tech')).toBe(false);
  });

  it('old backups put every unit into one created group; real groups load as they are', () => {
    const old = backupSchema.parse({
      items: [],
      roomUnits: [
        { id: 'a', name: 'Bed' },
        { id: 'b', name: 'Lamp' },
      ],
    });
    expect(old.roomUnitGroups).toEqual([{ id: DEFAULT_UNIT_GROUP_ID, name: '' }]);
    expect(old.roomUnits).toEqual([
      { id: 'a', name: 'Bed', group: DEFAULT_UNIT_GROUP_ID },
      { id: 'b', name: 'Lamp', group: DEFAULT_UNIT_GROUP_ID },
    ]);
    expect(backupSchema.parse({ items: [] }).roomUnitGroups).toEqual([]);

    const now = backupSchema.parse({
      items: [],
      roomUnitGroups: [{ id: 'bath', name: 'Bathroom', names: { et: 'Vannituba' } }],
      roomUnits: [{ id: 'a', name: 'Faucet', group: 'bath' }],
    });
    expect(now.roomUnitGroups).toEqual([
      { id: 'bath', name: 'Bathroom', names: { et: 'Vannituba' } },
    ]);
    expect(now.roomUnits).toEqual([{ id: 'a', name: 'Faucet', group: 'bath' }]);
  });

  it('group names are localized', () => {
    const d = { ...data(), roomUnitGroups: [{ id: 'bath', name: 'Bath', names: { et: 'Vann' } }] };
    expect(localizeNames(d, 'et').roomUnitGroups[0]!.name).toBe('Vann');
    expect(localizeNames(d, 'en').roomUnitGroups[0]!.name).toBe('Bath');
  });

  it('bodies: a unit names its group; a move names unit and group', () => {
    expect(roomUnitCreateSchema.parse({ name: 'Bed', group: 'g' })).toEqual({
      name: 'Bed',
      group: 'g',
    });
    expect(unitOrderSchema.parse({ ids: ['a'], move: { id: 'a', group: 'g' } }).move).toEqual({
      id: 'a',
      group: 'g',
    });
  });
});
