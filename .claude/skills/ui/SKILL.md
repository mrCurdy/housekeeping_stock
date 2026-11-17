---
name: ui
description: Build or change Fomka's client UI (client/src): a page, card, form, table, dialog, a new data change through StockContext, styling, phone layout or a client test. Use for any feature work that touches React components, so it follows the existing patterns without exploring the codebase.
---

# Building UI in Fomka

The file map and the "Where to change X" table are in `docs/structure.md`. Read that, not the
tree. Then open only the page folder you change, plus the one or two components it imports.

## A feature end to end

Data lives on the server. The client keeps one copy of it in `StockContext`, and every change goes through it:

1. **shared/**: the type in `types.ts`, a zod body schema in `schemas.ts` (and in `backupSchema` if it's stored).
2. **server**:
   - a `Db` method (`sqlite-db` skill);
   - a route in `routes/<area>.ts` with `validateBody(schema)` and `allow(perm)` (`auth` skill);
   - a test in a new `server/tests/<feature>.test.ts` (setup: `tests/helpers.ts`).
3. **`context/stock/mutations.ts`**: add the method to `StockMutations` and implement it in its area's group (`setupMutations`, `dailyMutations`, `checklistMutations`, `settingsMutations`, `roomMutations`, `roomSetupMutations`) like its neighbours:
   ```ts
   setThing: (id: string, value: number) => {
     // optimistic; copies only d.things (pass ['things', 'other'] when fn changes several keys)
     edit('things', (d) => { d.things[id] = value; });
     void send(() => api.put(`/things/${id}`, { value })); // toast + reload on failure
   },
   ```
   - `edit(key, fn)` deep-copies only the named top-level key(s): `fn` must not change any other part of `d`. `StockContext.tsx` keeps only the state, polling, `send` and `edit`.
   - A rule shared with the server (like `editTask`) goes in `shared/` and is called inside `edit()`.
   - Use `send(..., { rethrow: true })` and `await` it only when the page shows its own error (the counter rows).
   - When the server answers with the merged day (counts, checks), write that answer into the state.
   - Name lists use the `named()` helper (add/rename/remove).
4. **Component**: `const { data, math, setThing } = useStock()`. `data` shows item/room type/unit/status names in the UI language (`localizeNames`); `rawData` keeps every version (Backup only). Derived stock figures always come from
   `math` (`calculateTotal`, `autoConsumption`, `series`). Totals are never stored.

## A new page

- Create `pages/<Name>.tsx` (default export) and put its parts in `pages/<name>/`.
- Add `{ path: '<name>', lazy: page(() => import('@/pages/<Name>')) }` in `App.tsx`.
- Add a `NAV` entry in `components/layout/AppShell.tsx` (an icon from `lucide-react`, `label: (t) => t.nav.<name>`, and `perm` to hide it).
- Use the page skeleton from `pages/Stock.tsx`:
  - `PageHeader` (`title`, `description`, `actions={<DateSwitcher />}` if it's per day);
  - `loadError` → `<Alert tone="danger">` with a "try again" `Button variant="link"`;
  - `loading` → a centred `<Spinner />`;
  - then a `flex flex-col gap-6` stack of `Card`s.
- For a page only some roles may open, give its `NAV` entry a `perm`: `AppShell` hides it and redirects anyone without it to their home page. Pages don't redirect themselves. The server must guard the routes as well.
- The selected day is `useSelectedDate().date`, a local `YYYY-MM-DD` string. Show it with `formatLongDate(date, locale)` (`@/lib/format`). Never use `toISOString()` for dates.

## Page files (`client/src/pages/`)

What each page's files own. Behaviour as the user sees it: "Pages" in `docs/behaviour.md`.

- `Stock.tsx` + `stock/`:
  - `DeparturesCard`, `ItemsCard` (192), `OverviewCard`, each titled by `StockCardHeader` (title, description, drag grip);
  - `GroupItemsModal`, `Legend`;
  - `useRoomStatus` (the "2/3 rooms" caption).
- `Counter.tsx` + `counter/`:
  - `AllRoomsTable`, `RoomCountList` (plays `Salute` when the room is fully counted), `RoomSwitcher`, `ManageRooms`;
  - `useCountDrafts` (drafts and row states).
- `Checklist.tsx` (+ test) + `checklist/`:
  - `TaskGroupCard` (one group: name with ✎ rename/delete, progress, its `TaskList`, "New task"), `TaskList` (grip handles via `lib/useListsDragSort`; ticking the group's last task calls `onAllDone`, the page plays `Salute`), `TaskEditor`, `ShiftNotes`;
  - `noteText.ts` (+ test): the instructions format (`parseNote`, `checkKeys`) and the list editing (`toggleList`, `indent`, `continueList`);
  - `NoteEditor` (the instructions textarea with list buttons), `TaskNote` (instructions shown with tickable checklist lines).
- `Rooms.tsx` (+ test) + `rooms/`:
  - `RoomCard` (number, type, the note (`CommitTextarea`), every master unit with a status `Select`, ✎ number/type/delete; no cleaning line), `WhoDialog` (name prefilled from `localStorage['rooms.who']`, optional note; optional `description`, `children` above the name and `confirmLabel`, used by `CleaningDialog`), `CleaningHistory` (a room's last 10 general cleanings, newest first, "date · who"; nothing when never cleaned; for the Cleaning page's dialog);
  - `roomText.ts` (+ test): `roomExists`, `typeOptions`, `cleaningText` (today / yesterday / N days ago), `statusName` (a default status still named as in `DEFAULT_ROOM_STATUSES` shows translated, `t.rooms.defaultStatus`).
  - `roomView.ts` (+ test): the view rules (pure): `roomLevel` (first character of the number), `roomLevels`, `sortByLevel` (level by level, then number: 001 … 003, 101 … 112, 201), `worstStatus` (the worst unit status, none without units), `roomUrgency` (its colour: 3 red, 2 yellow, 1 extra, 0 green), `allGreen`, `matchesSearch(room, query)` (trimmed, any case: the number starts with it; types don't match), `viewRooms(data, { level, sort, hideGreen, search? })` (a search replaces the level filter while typed, hide-green only while units exist, sort `number` = `sortByLevel` / `attention`; ties by `sortByLevel`); for the Cleaning page `cleaningDays(data, roomId, today)` (days since the latest cleaning, null never, and its `cleaningLevel` colour) and `viewCleaning(data, { level, dirtyFirst, search? }, today)` (level and search as in `viewRooms`; dirty first = most days first, never cleaned on top, ties by `sortByLevel`; off = `sortByLevel`).
  - `RoomSearch` (the search field with ×, not remembered), `LevelFilter` (the "Level" group of buttons, and `toggleProps` for an on/off `Button`; also used by `CleaningFilters`), `RoomFilters` (the bar: `LevelFilter`, the Needs attention first toggle, hide-green, and the "View" group: Full cards / Compact tiles icon buttons; on/off = `Button` primary/outline with `aria-pressed`), `useRoomView(levels)` (+ test; the view and `mode: 'full' | 'compact'` in `localStorage['rooms.view']`, try/catch; a stored level that no longer exists shows as All; no stored mode = compact below `sm` (`matchMedia('(max-width: 639px)')`), full otherwise).
  - `RoomTile` (the compact tile, a square `button` "Open room N": number, type and a wrench coloured by `worstStatus` (no wrench without units), a `role="img"` with the translated meaning). `RoomCard` takes an optional `onClose` (an × "Close room N") and `className` for the open tile.
- `Cleaning.tsx` (+ test) + `cleaning/`: `CleaningTile` (a square `button` "Room N: Cleaned 3 days ago · Mari": number, broom (`Broom`) and the days, both the days and the border coloured by `cleaningDays`, "—" never), `CleaningFilters` (`LevelFilter` + the Dirty first toggle), `useCleaningView(levels)` (`{ level, dirtyFirst }` in `localStorage['cleaning.view']`, try/catch), `CleaningDialog` (`WhoDialog` with the latest cleaning, `CleaningHistory`, "Choose date" (its `extraAction`) → a date picker → `markCleaned(id, by, date)`, and "Cleaned today" → `markCleaned`).
- `Settings.tsx` (+ test): the page (the admin-only redirect is `AppShell`'s); `settings/`: `PinForm`, `RolesCard` (a table: the four staff permissions × Housekeeper/Reception checkboxes, each tick saves at once; Reset to defaults), `QrCard`, `DataCard` (Excel / Backup / Restore), `SaluteCard`, `RoomSetupCard` (the room cards' master setup, `setup` only: an "Add room" button opening `RoomDialog` (number, type, note; a taken number shows the error before sending), then a "Rooms" list in `sortByLevel` order (a wrapped grid of small rows in a scroll box: number, type, ✎ opens the same `RoomDialog` in edit mode sending only the changed fields, 🗑 removes the card confirmed), `UnitGroups` (+ test: the units in group boxes, each with a header band (`data-group-header`: `bg-surface-2`, a bottom border, the name semibold); a unit's grip drags it with `useListsDragSort`, also into another group, a group's grip with `useDragSort` `free`; rename in place, "Add unit" per group, "Add group"; 🗑 on a group with units only shows a toast), statuses with a colour `Select`, room types, each a `MasterList` (rename in place, a grip to drag with `useDragSort` (↑/↓ on the focused grip), remove confirmed, `AddForm`), plus `CleaningThresholds` (both days checked together, 0 ≤ green < yellow, before `updateSettings`)). `Login.tsx`: the PIN keypad (+ test); it auto-submits only a typed 4th digit, an autofilled/pasted PIN waits for "Log in"; on a touch screen (`pointer: coarse`) the field isn't focused (on open or after a wrong PIN), so only the keypad shows, not the OS keyboard. `NotFound.tsx`.

## UI kit (`import { … } from '@/components/ui'`)

| Component                                                                                                                                   | Key props                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                                                    | `variant` primary·secondary·outline·ghost·danger·link, `size` sm·md·lg·icon·icon-sm, `loading`, `leftIcon`, `block`                                             |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardBody`, `CardFooter`                                                              | plain divs with styling                                                                                                                                         |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`                                                                                                 | `Table` scrolls sideways inside its card                                                                                                                        |
| `Input`, `Textarea`, `Select` (`options`), `Checkbox`, `Switch` (`checked`, `onCheckedChange`), `Slider`                                    | `invalid`; wrap in `FormField` (`label`, `hint`, `error`)                                                                                                       |
| `CommitInput`, `CommitTextarea`                                                                                                             | `value`, `onCommit(text)`: edits freely, saves on blur/Enter/unmount, Escape reverts                                                                            |
| `Modal`                                                                                                                                     | `open`, `onClose`, `title`, `description`, `footer`, `size` sm·md·lg                                                                                            |
| `Alert` (`tone` info·success·warning·danger, `title`), `Badge` (`tone`, `outline`), `EmptyState` (`icon`, `title`, `description`, `action`) |                                                                                                                                                                 |
| `Dropdown` (`trigger`, `items`, `align`), `Tabs` (`items`, `value`, `onValueChange`), `Tooltip` (`content`, `side`, `align`)                |                                                                                                                                                                 |
| `AddForm`, `ClearableInput`                                                                                                                 | `AddForm`: `placeholder`, `label`, `onAdd(name)`, the "new name" line under a list. `ClearableInput`: `CommitInput` props + `onClear` (× clears a manual value) |
| `Spinner` (`size`), `Skeleton`, `Avatar`                                                                                                    |                                                                                                                                                                 |

Outside the kit:

- `useDragSort(count, onMove)` (`@/lib/useDragSort`): reorder a vertical list by a grip or ↑/↓. Put `rowRef(i)`/`rowStyle(i)` on rows and `handleProps(i)` on a `touch-none` grip button (the checklist group cards in `Checklist.tsx`). Pass `{ free: true }` when rows can sit side by side, and highlight `over` (`Stock.tsx`).
- `useListsDragSort(counts, onMove)` (`@/lib/useListsDragSort`): the same over several lists, rows can move between them (`TaskList` inside `TaskGroupCard`, the units in `pages/settings/UnitGroups.tsx`); `listRef(l)` on each list's whole area, `target` for the drop line. `UnitGroups.test.tsx` fakes the boxes for a drag between lists.
- `useConfirm()`: `if (await confirm({ title, description, confirmLabel })) …`. It is red by default; pass `danger: false` for a neutral one.
- `useToast()`: `toast.success|error|info(title, description?)`.
- `apiErrorMessage(err, t)` turns any request error into text.
- `parseQty` (≥ 0) / `parseNumber` (negatives allowed) read typed numbers. Both accept `2,5`, return `null` for empty and `undefined` for invalid text (then show `toast.error(t.common.enterNumber)`).

**Which input:**

- Numbers and names inside tables → `CommitInput`.
- Text where an accidental change would hurt (task names) → plain `Input`s with an explicit Save button (`TaskEditor.tsx`).
- Several fields that are checked together (PINs, the cleaning thresholds) → a `<form>` with `FormField`s (`pages/settings/PinForm.tsx`, `CleaningThresholds.tsx`).
- An ordered list of names (rename / drag grip / remove / add) → `pages/settings/MasterList.tsx`. Every reorderable list drags by a grip (`GRIP` style from `settings/UnitGroups.tsx`); no ↑/↓ buttons.

## Styling

- A "who did it" step before a change: `pages/rooms/WhoDialog.tsx` (a `Modal` with a `<form id>` and the submit button in `footer` via `form={id}`; `children`, `description`, `confirmLabel` and `extraAction` (a secondary button left of the confirm, e.g. "Choose date") turn it into a page's own dialog, like `pages/cleaning/CleaningDialog.tsx`). A per-device remembered value goes in `localStorage` inside try/catch. A remembered view (filters, sort, a full/compact mode with a `matchMedia` default) is a small hook like `pages/rooms/useRoomView.ts`; on/off toggle buttons are `Button` `primary`/`outline` with `aria-pressed` (`toggleProps` and the level buttons `LevelFilter` in `pages/rooms/LevelFilter.tsx`). A colour-coded icon needs `role="img"` + `aria-label` so the meaning isn't only the colour (`RoomTile.tsx`).
- Names with per-language versions (items, room types, units, unit groups, statuses): wherever one is shown or edited, spread `useUntranslated()(entity)` (`@/lib/untranslated`) as `title` + `cn(…, className)`, so the admin sees one with no version in the UI language (`nameMissing`) marked. Its edit field gets `confirmUnchanged={entity.nameMissing}` (`CommitInput`: Enter commits the unchanged text), and an `onCommit` that skips unchanged text must still save it when `nameMissing`. A new localized-list mutation's create sends `lang` and adds `createdName(row.name, lang)` to the returned row (as `named(…, localized = true)` in `stock/mutations.ts` does).
- Room status colours: take the classes from `ROOM_COLOR_CLASSES[color]` (`@/lib/roomColors`), never build `bg-status-${c}` strings (Tailwind can't find them). Show a status's name with `statusName(s, t.rooms.defaultStatus)` (`pages/rooms/roomText.ts`), so the defaults are translated.
- Use semantic tokens only: `bg-surface`, `bg-surface-2`, `text-fg`, `text-fg-muted`, `border-border`, `text-primary`, `bg-primary-soft`, and `success|warning|danger|info` (+ `-soft`). Raw colours break dark mode. Merge classes with `cn()`.
- **Stock figures:**
  - `val-calc`: calculated;
  - `val-manual`: typed by hand;
  - `val-rooms`: from the room counts;
  - `val-short`: a negative total.
  - Use `no-spin` on number inputs in tables.
- **Phones:**
  - Wrap grids as `grid grid-cols-1 …` with `minmax(0,…)` columns, so a wide table scrolls inside its card and not the page.
  - Fields get 16px text on touch screens automatically (no iOS zoom), so don't override `font-size` on inputs.
  - Don't auto-focus a field on a touch screen when the page has its own buttons for it (the PIN keypad in `Login.tsx`): `matchMedia('(pointer: coarse)')` in try/catch; focusing opens the OS keyboard on top.
  - The header holds only the language, palette, theme and log-out buttons on every page; admin tools go in Settings cards, not the header.
- Icons come from `lucide-react` at `h-4 w-4`. Icon-only buttons need `aria-label` and `title`.

## Roles and modes

- `useAuth().can('setup' | 'tasks' | 'restore' | 'pins' | 'qr' | 'daily' | 'checklist' | 'count' | 'cleaning')` hides the controls a role can't use (see `ItemsCard`: `setup` shows rename/remove/add).
- Hiding is only cosmetic: the route needs `allow(perm)` as well.
- A counter (QR) session is `todayOnly(role)`. It sees only `/counter`, and its date is locked to today.

## Text

Every visible string, `aria-label` and `title` comes from `t` (`const { t, locale } = useI18n()`).
Add it to `i18n/en.ts` first, then to `et.ts`/`ru.ts` (the `i18n` skill has the glossary and the
plurals). Never read the et/ru files whole.

## Tests

- Client tests live next to the code (`*.test.tsx`).
  - Fake the server with `mockApi((method, path, body) => reply)` from `@/test/fetch`.
  - Wrap the component in only the providers it uses. `Settings.test.tsx` is the pattern: Toast → Confirm → Auth.
  - A context's own behaviour (`StockContext`): `context/StockContext.test.tsx` renders a small consumer of `useStock()` under I18n → Toast → Auth → Date → Stock. Its `fakeApi` can hold a request open (a `deferred` reply), and it drives the poll with `vi.useFakeTimers({ shouldAdvanceTime: true })` + `POLL_MS`. A change to `StockContext` must keep this file green.
  - A whole page with real data (`StockContext`, routes, roles): set the URL with `window.history.replaceState`, answer `/auth/me` and `/data` in `mockApi`, then `await import('../App')` and render it. `pages/Checklist.test.tsx` is the pattern (it also shows faking row positions for a pointer drag).
  - For page data use `@/test/fixtures`: `mockApp(role, stockFixture({ …overrides }), route?)` answers `/auth/me` and `/data` (`today`/`yesterday` are the fixture's dates). `pages/Stock.test.tsx` → "stock items" is the short pattern.
  - Call `vi.unstubAllGlobals()` in `afterEach`.
- Query by role and label (`screen.getByRole('button', { name: … })`) using the English text.
- Run one file: `cd client && npx vitest run src/pages/<File>.test.tsx | tail -30`.
- Before committing: `npm run lint && npm run typecheck && npm test`.

## Saving tokens

- Start from `docs/structure.md` and this skill. Don't list or read folders to "get a feel".
- Read big files in parts: `stock/mutations.ts` (grep the method name), `en.ts` (grep the section).
- Copy the nearest existing component and change it. Don't design from scratch.
- Don't re-read files after editing them. Pipe test and build output through `| tail`.
- If a change shifts the structure (a new file, page or rule), update `docs/structure.md` (and `docs/behaviour.md` for a page's behaviour) in the same commit. A new or changed file under `pages/` goes in "Page files" above (and its name in the short list in `structure.md`).
