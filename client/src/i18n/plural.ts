/** Picks the plural form for `n` by the language's CLDR rules (Russian needs one/few/many). */
export function plural(locale: string) {
  const rules = new Intl.PluralRules(locale);
  return (n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) =>
    `${n} ${forms[rules.select(n)] ?? forms.other}`;
}
