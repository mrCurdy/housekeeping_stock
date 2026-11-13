/**
 * Names typed by the user (stock items, room types, room units, room statuses) can have a version
 * per UI language. `name` is the base name (what was first entered; old data has only it), `names`
 * the per-language overrides. A language without an override shows the base name.
 */

/** The UI languages a name can have a version in (the client's `LANGUAGES` codes). */
export const NAME_LANGS = ['en', 'et', 'ru'] as const;
export type NameLang = (typeof NAME_LANGS)[number];
export type LocalizedNames = Partial<Record<NameLang, string>>;

export interface Localized {
  name: string;
  /** Per-language versions. Never empty, never equal to `name`. Missing = none. */
  names?: LocalizedNames;
}

/** The name to show in `lang`: its override, else the base name. */
export const displayName = (entity: Localized, lang: string): string =>
  entity.names?.[lang as NameLang]?.trim() || entity.name;

/** Real overrides only: known languages, trimmed, not blank, not equal to the base. */
export function cleanNames(
  names: LocalizedNames | undefined,
  base: string,
): LocalizedNames | undefined {
  const out: LocalizedNames = {};
  for (const lang of NAME_LANGS) {
    const v = names?.[lang]?.trim();
    if (v && v !== base) out[lang] = v;
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
  const next = cleanNames(lang ? { ...names, [lang]: name } : names, base);
  return { ...rest, name: base, ...(next && { names: next }) } as T;
}

interface WithLocalizedLists {
  items: Localized[];
  roomTypes: Localized[];
  roomUnits: Localized[];
  roomStatuses: Localized[];
}

/**
 * The dataset as shown in `lang`: every localized `name` replaced by `displayName` (`names` kept).
 * Lists (and the dataset) without any versions are returned as they are.
 */
export function localizeNames<D extends WithLocalizedLists>(data: D, lang: string): D {
  // `?.`: a partial dataset (old test fixtures) may lack a list
  const list = <T extends Localized>(rows: T[]) =>
    rows?.some((r) => r.names)
      ? rows.map((r) => (r.names ? { ...r, name: displayName(r, lang) } : r))
      : rows;
  const items = list(data.items);
  const roomTypes = list(data.roomTypes);
  const roomUnits = list(data.roomUnits);
  const roomStatuses = list(data.roomStatuses);
  if (
    items === data.items &&
    roomTypes === data.roomTypes &&
    roomUnits === data.roomUnits &&
    roomStatuses === data.roomStatuses
  )
    return data;
  return { ...data, items, roomTypes, roomUnits, roomStatuses };
}
