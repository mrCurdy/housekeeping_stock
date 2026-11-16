import { DEFAULT_ROOM_STATUSES } from './types';

/**
 * Names typed by the user (stock items, room types, room units and their groups, room statuses) can have a version
 * per UI language. `name` is the base name (what was first entered; old data has only it), `names`
 * the per-language overrides. A language without an override shows the base name.
 */

/** The UI languages a name can have a version in (the client's `LANGUAGES` codes). */
export const NAME_LANGS = ['en', 'et', 'ru'] as const;
export type NameLang = (typeof NAME_LANGS)[number];
export type LocalizedNames = Partial<Record<NameLang, string>>;

export interface Localized {
  name: string;
  /** Per-language versions. Never empty. One equal to `name` confirms the base text in that language. */
  names?: LocalizedNames;
  /** Shown data only (`localizeNames`): no version in the UI language, the base name is shown. */
  nameMissing?: boolean;
}

/** The entity has its own version in `lang` (else it is shown from the base name). */
export const hasOwnName = (entity: Localized, lang: string): boolean =>
  !!entity.names?.[lang as NameLang]?.trim();

/** The name to show in `lang`: its override, else the base name. */
export const displayName = (entity: Localized, lang: string): string =>
  entity.names?.[lang as NameLang]?.trim() || entity.name;

/**
 * Real overrides only: known languages, trimmed, not blank. One equal to the base is kept: it is
 * the admin confirming the base text in that language (`hasOwnName`).
 */
export function cleanNames(names: LocalizedNames | undefined): LocalizedNames | undefined {
  const out: LocalizedNames = {};
  for (const lang of NAME_LANGS) {
    const v = names?.[lang]?.trim();
    if (v) out[lang] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The entity renamed in `lang`: only that language's version changes (the base name stays, so the
 * other languages keep theirs). Without `lang` the base name changes. A copy; `names` is dropped
 * when nothing is left.
 */
export function renameIn<T extends Localized>(entity: T, name: string, lang?: NameLang): T {
  const { names, ...rest } = entity;
  const base = lang ? entity.name : name;
  const next = cleanNames(lang ? { ...names, [lang]: name } : names);
  return { ...rest, name: base, ...(next && { names: next }) } as T;
}

/**
 * A new entity's name: the base `name` and, with `lang` (the UI language it was created in), that
 * language's version too, so it isn't marked untranslated there. Without `lang` only the base.
 */
export function createdName(name: string, lang?: NameLang): Localized {
  const names = lang ? cleanNames({ [lang]: name }) : undefined;
  return { name, ...(names && { names }) };
}

interface WithLocalizedLists {
  items: Localized[];
  roomTypes: Localized[];
  roomUnits: Localized[];
  roomUnitGroups: Localized[];
  roomStatuses: Localized[];
}

/**
 * The dataset as shown in `lang`: every localized `name` replaced by `displayName` (`names` kept),
 * and `nameMissing: true` on a name with no version in `lang`. A name the app shows translated
 * itself is never missing while it was never renamed (no `names`): an empty one (the default unit
 * group) and a default status with its default name.
 * Lists (and the dataset) where nothing changes are returned as they are.
 */
export function localizeNames<D extends WithLocalizedLists>(data: D, lang: string): D {
  const builtIn = (r: Localized & { id?: string }, statuses: boolean) =>
    !r.names &&
    (r.name === '' ||
      (statuses && DEFAULT_ROOM_STATUSES.some((s) => s.id === r.id && s.name === r.name)));
  const show = <T extends Localized & { id?: string }>(r: T, statuses: boolean): T => {
    const name = displayName(r, lang);
    const missing = !hasOwnName(r, lang) && !builtIn(r, statuses);
    if (name === r.name && missing === !!r.nameMissing) return r;
    const { nameMissing: _, ...rest } = r;
    return { ...rest, name, ...(missing && { nameMissing: true }) } as T;
  };
  // `?.`: a partial dataset (old test fixtures) may lack a list
  const list = <T extends Localized>(rows: T[], statuses = false) => {
    const next = rows?.map((r) => show(r, statuses));
    return next?.every((r, i) => r === rows[i]) ? rows : next;
  };
  const items = list(data.items);
  const roomTypes = list(data.roomTypes);
  const roomUnits = list(data.roomUnits);
  const roomUnitGroups = list(data.roomUnitGroups);
  const roomStatuses = list(data.roomStatuses, true);
  if (
    items === data.items &&
    roomTypes === data.roomTypes &&
    roomUnits === data.roomUnits &&
    roomUnitGroups === data.roomUnitGroups &&
    roomStatuses === data.roomStatuses
  )
    return data;
  return { ...data, items, roomTypes, roomUnits, roomUnitGroups, roomStatuses };
}
