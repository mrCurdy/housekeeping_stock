---
name: i18n
description: Add or change user-visible text in Stock Monitor so it exists in all three languages (English, Estonian, Russian), or add a new language. Use whenever a change adds or edits UI text (labels, buttons, toasts, confirm dialogs, tooltips, aria-labels, placeholders, empty states, Excel headers), when adding a page or component with text, or when the user asks to translate or fix a translation.
---

# Translating Stock Monitor (en / et / ru)

The client has no i18n library. All UI text lives in typed dictionaries:

- `client/src/i18n/en.ts`: the **source** dictionary. Its shape is the `Messages` type.
- `client/src/i18n/et.ts`, `client/src/i18n/ru.ts`: typed `Messages`, so a missing or extra key fails `npm run typecheck`.
- `client/src/i18n/plural.ts`: `plural(locale)(n, { one, few, many, other })` → `"5 помещений"`.
- `client/src/context/I18nContext.tsx`: `LANGUAGES`, `I18nProvider`, `useI18n()` → `{ t, lang, locale, setLang }`. The choice is stored per device in `localStorage.lang`; the first visit uses the browser language, else English. Without a provider the hook returns English (so UI kit tests render).
- `client/src/components/layout/LanguageSwitcher.tsx`: the EN/ET/RU menu in the header.
- `client/src/i18n/i18n.test.tsx`: same keys in every language, no empty text, Russian plurals, the switcher.

The server stays English. `apiErrorMessage(err, t)` in `lib/api.ts` maps error codes (`BAD_REQUEST`, `NOT_FOUND`, 5xx, network) to translated text. If you add a server error the user should read, give it a code and map it there.

## Adding or changing text

1. Add the key to `en.ts` in the section of the page/component (`common`, `nav`, `data`, `stock.items`, `counter`, `excel`…). Reuse a `common.*` key when the meaning is identical (Remove, Cancel, Today, Stock name, enterQty…).
2. Add the same key, translated, to `et.ts` **and** `ru.ts` in the same position. Never leave English in them.
3. In the component: `const { t } = useI18n();` and use `t.section.key`. Big components alias a section: `const tx = t.counter;`.
4. Text with values is a function: `removeTitle: (name: string) => \`Remove "${name}"?\``. In et/ru the parameter types come from `Messages`, so write `(name) => …`. Do not build sentences by concatenating keys in the component: word order differs.
5. Counts with a noun use `p(n, { … })` from `plural(locale)` at the top of the dictionary. Russian needs `one`/`few`/`many`/`other` (1 позиция, 3 позиции, 5 позиций, 21 позиция); Estonian and English need `one`/`other`. For `2/3`-style captions avoid plurals (`ru: "2/3 помещ."`, `et: "2/3 ruumi"`).
6. Text with markup inside (e.g. a `<strong>`) is split into parts (`howTo: { before, after }`), not HTML strings.
7. Dates: always pass `locale` from `useI18n()` (`formatLongDate(date, locale)`, `toLocaleDateString(locale, …)`, and add `locale` to the `useMemo` deps). Never `undefined`.
8. Plain functions outside React (`lib/excel.ts`, `apiErrorMessage`) take `t` (or a section like `t.excel`) as a parameter.
9. User data is never translated: item, group and room names are shown as typed. Only fallbacks like `t.common.unnamedItem` are.
10. Run `npm run lint && npm run typecheck && npm test`. If the text is on a phone screen (Inventory count), check that the Russian version fits: it is usually the longest.

## Glossary (keep it consistent)

| English | Eesti | Русский |
|---|---|---|
| Stock (page) | Ladu | Склад |
| Stock / Total stock (figure) | Laoseis | Остаток (card: Остатки) |
| Inventory count | Inventuur | Инвентаризация |
| Item / stock item | Toode | Позиция |
| Stock name | Nimetus | Наименование |
| Consumption | Kulu | Расход |
| Income | Juurdetulek | Приход |
| Departures | Lahkumised | Выезды |
| Group | Grupp | Группа |
| Items per departure | Kulu ühe lahkumise kohta | Расход на один выезд |
| Hotel room (checked out) | tuba / toad | номер / номера |
| Room where stock is counted (location) | ruum / ruumid | помещение / помещения |
| Counted | Loetud | Посчитано |
| Shortage | Puudujääk | Недостача |
| Calculated / Entered by hand | Arvutatud / Käsitsi sisestatud | Рассчитано / Введено вручную |
| Backup / Restore | Varukoopia / Taasta | Копия / Восстановить |
| Save / Saved / Retry | Salvesta / Salvestatud / Proovi uuesti | Сохранить / Сохранено / Повторить |
| Remove | Eemalda | Удалить |
| Today | Täna | Сегодня |
| Checklist | Kontrollnimekiri | Чек-лист |
| Task | Ülesanne | Задача |
| Instructions | Juhend | Инструкция |
| Note for the next shift | Kommentaar järgmisele vahetusele | Комментарий для следующей смены |
| Settings | Seaded | Настройки |
| Admin / Worker (role) | administraator / töötaja | администратор / сотрудник |
| PIN / QR code | PIN / QR-kood | PIN / QR-код |
| Revoke | Tühista | Отозвать |

"Room" is ambiguous in English: hotel rooms (departures) and storage rooms (locations) are different words in et and ru. Pick by meaning.

Style: Estonian quotes `„…“`, Russian `«…»`, English `"…"`. Short, plain wording: the users are housekeeping staff, often on a phone. Use the informal imperative in Estonian (Sisesta, Vajuta) and the polite imperative in Russian (Введите, Нажмите). Keep "Stock Monitor" and "Excel" untranslated.

## Adding a language

1. Copy `en.ts` to `client/src/i18n/<code>.ts`, type it `export const xx: Messages = {…}`, use `plural('<code>')`, translate everything.
2. Add `{ code, name (in that language), locale, messages }` to `LANGUAGES` in `I18nContext.tsx`. The switcher and the test pick it up.
3. Add a column to the glossary above, and plural checks to `i18n.test.tsx` if the language has more than `one`/`other`.
