import { describe, expect, it } from 'vitest';
import { cleanNames, displayName, localizeNames, renameIn } from './names';
import { backupSchema, itemPatchSchema, normalizeStockData, roomNameSchema } from './schemas';
import { emptyStockData } from './types';

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
    // back to the base name: the override goes
    expect(renameIn(towel, 'Rätik', 'en')).toEqual({ id: 'a', name: 'Rätik' });
  });

  it('cleanNames drops empty overrides, overrides equal to the base and unknown languages', () => {
    expect(cleanNames({ en: 'Towel', et: 'Rätik', ru: '  ' }, 'Rätik')).toEqual({ en: 'Towel' });
    expect(cleanNames({ et: 'Rätik' }, 'Rätik')).toBeUndefined();
    expect(cleanNames(undefined, 'Rätik')).toBeUndefined();
    expect(cleanNames({ de: 'Handtuch' } as never, 'Rätik')).toBeUndefined();
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
      names: { en: 'Towel' },
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
    expect(parsed.roomUnits[0]).toEqual({ id: 'u', name: 'Voodi' });
  });

  it('rename bodies take an optional language', () => {
    expect(itemPatchSchema.parse({ name: 'Towel', lang: 'en' })).toEqual({
      name: 'Towel',
      lang: 'en',
    });
    expect(roomNameSchema.safeParse({ name: 'Bed', lang: 'de' }).success).toBe(false);
  });

  it('localizeNames shows each list in a language and keeps a dataset without versions as is', () => {
    const plain = emptyStockData();
    plain.items = [{ id: 'p', name: 'Soap', multipliers: {} }];
    expect(localizeNames(plain, 'en')).toBe(plain);
    const data = { ...plain, items: [...plain.items, { ...towel, multipliers: {} }] };
    const en = localizeNames(data, 'en');
    expect(en.items.map((i) => i.name)).toEqual(['Soap', 'Towel']);
    expect(en.items[1]!.names).toEqual({ en: 'Towel' });
    expect(en.roomUnits).toBe(data.roomUnits);
    expect(localizeNames(data, 'ru').items[1]!.name).toBe('Rätik');
  });
});
