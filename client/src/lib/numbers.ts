/**
 * Reads a typed quantity. '' = cleared (null); "2,5" is accepted as 2.5.
 * Returns undefined when the text is not a number of 0 or more.
 */
export function parseQty(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Like parseQty, but negative numbers are allowed (a stock figure can be a shortage). */
export function parseNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
