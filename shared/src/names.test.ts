import { describe, expect, it } from 'vitest';
import { cleanNames, createdName, displayName, hasOwnName, localizeNames, renameIn } from './names';
import {
  backupSchema,
  itemCreateSchema,
  itemPatchSchema,
  normalizeStockData,
  roomNameSchema,
  roomStatusCreateSchema,
  roomUnitCreateSchema,
} from './schemas';
import { emptyStockData, type Item, type RoomStatus, type RoomUnitGroup } from './types';

describe('localized names', () => {
  const towel = { id: 'a', name: 'Rätik', names: { en: 'Towel' } };

  it('displayName: the override for the language, else the base name', () => {
    expect(displayName(towel, 'en')).toBe('Towel');
    expect(displayName(towel, 'et')).toBe('Rätik');
    expect(displayName(towel, 'ru')).toBe('Rätik');
    expect(displayName({ name: 'Plain' }, 'en')).toBe('Plain');
    expect(displayName({ name: 'X', names: { ru: ' ' } }, 'ru')).toBe('X');
  });

  it('renameIn writes only that language; no language = the base name', () => {
    expect(renameIn({ id: 'a', name: 'Rätik' }, 'Towel', 'en')).toEqual(towel);
    const ru = renameIn(towel, 'Полотенце', 'ru');
    expect(ru).toEqual({ id: 'a', name: 'Rätik', names: { en: 'Towel', ru: 'Полотенце' } });
    expect(renameIn(towel, 'Käterätik')).toEqual({ ...towel, name: 'Käterätik' });
    // saved unchanged (equal to the base): the language's version is confirmed and kept
    expect(renameIn(towel, 'Rätik', 'et')).toEqual({
      ...towel,
      names: { en: 'Towel', et: 'Rätik' },
    });
  });

  it('cleanNames drops empty overrides and unknown languages, keeps one equal to the base', () => {
    expect(cleanNames({ en: 'Towel', et: 'Rätik', ru: '  ' })).toEqual({
      en: 'Towel',
      et: 'Rätik',
    });
    expect(cleanNames({ ru: ' ' })).toBeUndefined();
    expect(cleanNames(undefined)).toBeUndefined();
    expect(cleanNames({ de: 'Handtuch' } as never)).toBeUndefined();
  });

  it('normalizeStockData keeps real overrides of items, room types, units and statuses', () => {
    const data = normalizeStockData({
      ...emptyStockData(),
      items: [{ id: 'i', name: 'Rätik', multipliers: {}, names: { en: 'Towel', et: 'Rätik' } }],
      roomTypes: [{ id: 't', name: 'Kahene', names: { en: '' } }],
      roomUnits: [{ id: 'u', name: 'Voodi', names: { ru: 'Кровать' } }],
      roomStatuses: [{ id: 's', name: 'Korras', color: 'green', names: { en: 'OK' } }],
    });
    expect(data.items[0]).toEqual({
      id: 'i',
      name: 'Rätik',
      multipliers: {},
      names: { en: 'Towel', et: 'Rätik' },
    });
    expect(data.roomTypes[0]).toEqual({ id: 't', name: 'Kahene' });
    expect(data.roomUnits[0]!.names).toEqual({ ru: 'Кровать' });
    expect(data.roomStatuses[0]!.names).toEqual({ en: 'OK' });
  });

  it('backupSchema reads names, and old backups without them', () => {
    const old = backupSchema.parse({ items: [{ id: 'i', name: 'Rätik' }] });
    expect(old.items[0]).toEqual({ id: 'i', name: 'Rätik', multipliers: {} });
    const parsed = backupSchema.parse({
      items: [{ id: 'i', name: 'Rätik', names: { en: 'Towel', xx: 'no' } }],
      roomUnits: [{ id: 'u', name: 'Voodi', names: 'broken' }],
    });
    expect(parsed.items[0]!.names).toEqual({ en: 'Towel' });
    expect(parsed.roomUnits[0]).toEqual({ id: 'u', name: 'Voodi', group: 'units' });
  });

  it('rename bodies take an optional language', () => {
    expect(itemPatchSchema.parse({ name: 'Towel', lang: 'en' })).toEqual({
      name: 'Towel',
      lang: 'en',
    });
    expect(roomNameSchema.safeParse({ name: 'Bed', lang: 'de' }).success).toBe(false);
  });

  it('localizeNames shows each list in a language and keeps an empty list as is', () => {
    const plain = emptyStockData();
    plain.items = [{ id: 'p', name: 'Soap', multipliers: {} }];
    const data = { ...plain, items: [...plain.items, { ...towel, multipliers: {} }] };
    const en = localizeNames(data, 'en');
    expect(en.items.map((i) => i.name)).toEqual(['Soap', 'Towel']);
    expect(en.items[1]!.names).toEqual({ en: 'Towel' });
    expect(en.roomUnits).toBe(data.roomUnits);
    expect(localizeNames(data, 'ru').items[1]!.name).toBe('Rätik');
  });

  it('hasOwnName: a version stored for that language (not the base fallback)', () => {
    expect(hasOwnName(towel, 'en')).toBe(true);
    expect(hasOwnName(towel, 'et')).toBe(false);
    expect(hasOwnName({ name: 'X', names: { ru: ' ' } }, 'ru')).toBe(false);
  });

  it('localizeNames flags names shown from the base name (nameMissing)', () => {
    const data = {
      ...emptyStockData(),
      items: [{ ...towel, multipliers: {} }] as Item[],
      roomUnitGroups: [
        { id: 'units', name: '' },
        { id: 'bath', name: '', names: { en: 'Bathroom' } },
      ] as RoomUnitGroup[],
      roomStatuses: [
        { id: 'ok', name: 'OK', color: 'green' as const },
        { id: 'fix', name: 'Broken', color: 'red' as const },
      ] as RoomStatus[],
    };
    const en = localizeNames(data, 'en');
    expect(en.items[0]!.nameMissing).toBeUndefined();
    expect(localizeNames(data, 'et').items[0]!.nameMissing).toBe(true);
    // the default group (no name) and an unrenamed default status are shown translated
    const et = localizeNames(data, 'et');
    expect(et.roomUnitGroups[0]!.nameMissing).toBeUndefined();
    expect(et.roomUnitGroups[1]!.nameMissing).toBe(true);
    expect(et.roomStatuses.map((s) => s.nameMissing)).toEqual([undefined, true]);
  });
});

describe('a new name has the language it was created in', () => {
  it('createdName: the base name plus, with a language, that version', () => {
    expect(createdName('Vannituba', 'et')).toEqual({
      name: 'Vannituba',
      names: { et: 'Vannituba' },
    });
    expect(createdName('Vannituba')).toEqual({ name: 'Vannituba' });
  });

  it('is not marked in that language, and is in the other two', () => {
    const item = { id: 'i', ...createdName('Rätik', 'et'), multipliers: {} } as Item;
    const data = { ...emptyStockData(), items: [item] };
    expect(localizeNames(data, 'et').items[0]!.nameMissing).toBeUndefined();
    expect(localizeNames(data, 'en').items[0]).toMatchObject({ name: 'Rätik', nameMissing: true });
    expect(localizeNames(data, 'ru').items[0]!.nameMissing).toBe(true);
    // normalizeStockData keeps the override equal to the base name
    expect(normalizeStockData(data).items[0]!.names).toEqual({ et: 'Rätik' });
  });

  it('create bodies take an optional language', () => {
    expect(itemCreateSchema.parse({ name: 'Towel', lang: 'en' })).toEqual({
      name: 'Towel',
      lang: 'en',
    });
    expect(itemCreateSchema.safeParse({ name: 'Towel', lang: 'de' }).success).toBe(false);
    expect(roomStatusCreateSchema.parse({ name: 'OK', color: 'green', lang: 'ru' }).lang).toBe(
      'ru',
    );
    expect(roomUnitCreateSchema.parse({ name: 'Bed', group: 'g', lang: 'et' }).lang).toBe('et');
  });
});
