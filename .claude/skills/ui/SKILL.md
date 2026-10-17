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
   - a route in `routes/<area>.ts` with `validate(schema)` and `allow(perm)` (`auth` skill);
   - a test in `server/tests/api.test.ts`.
3. **`StockContext.tsx`**: add the method to `StockApi` and implement it like its neighbours:
   ```ts
   setThing: (id, value) => {
     edit((d) => { /* change the draft, e.g. d.things[id] = value */ }); // optimistic
     void send(() => api.put(`/things/${id}`, { value }));            // toast + reload on failure
   },
   ```
   - A rule shared with the server (like `editTask`) goes in `shared/` and is called inside `edit()`.
   - Use `send(..., { rethrow: true })` and `await` it only when the page shows its own error (the counter rows).
   - When the server answers with the merged day (counts, checks), write that answer into the state.
   - Name lists use the `named()` helper (add/rename/remove).
4. **Component**: `const { data, math, setThing } = useStock()`. Derived stock figures always come from
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
- For an admin-only page, start with `if (!can('<perm>')) return <Navigate to="/stock" replace />`. The server must guard the routes as well.
- The selected day is `useSelectedDate().date`, a local `YYYY-MM-DD` string. Show it with `formatLongDate(date, locale)`. Never use `toISOString()` for dates.

## UI kit (`import { … } from '@/components/ui'`)

| Component                                                                                                                                   | Key props                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                                                    | `variant` primary·secondary·outline·ghost·danger·link, `size` sm·md·lg·icon·icon-sm, `loading`, `leftIcon`, `block` |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardBody`, `CardFooter`                                                              | plain divs with styling                                                                                             |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`                                                                                                 | `Table` scrolls sideways inside its card                                                                            |
| `Input`, `Textarea`, `Select` (`options`), `Checkbox`, `Switch` (`checked`, `onCheckedChange`), `Slider`                                    | `invalid`; wrap in `FormField` (`label`, `hint`, `error`)                                                           |
| `CommitInput`, `CommitTextarea`                                                                                                             | `value`, `onCommit(text)`: edits freely, saves on blur/Enter/unmount, Escape reverts                                |
| `Modal`                                                                                                                                     | `open`, `onClose`, `title`, `description`, `footer`, `size` sm·md·lg                                                |
| `Alert` (`tone` info·success·warning·danger, `title`), `Badge` (`tone`, `outline`), `EmptyState` (`icon`, `title`, `description`, `action`) |                                                                                                                     |
| `Dropdown` (`trigger`, `items`, `align`), `Tabs` (`items`, `value`, `onValueChange`), `Tooltip` (`content`, `side`, `align`)                |                                                                                                                     |
| `Spinner` (`size`), `Skeleton`, `Avatar`                                                                                                    |                                                                                                                     |

Outside the kit:

- `AddForm` (`placeholder`, `label`, `onAdd(name)`): the "new name" line under a list.
- `ClearableInput`: `CommitInput` props plus `onClear`, showing an × when a manual value overrides a calculated one.
- `useConfirm()`: `if (await confirm({ title, description, confirmLabel })) …`. It is red by default; pass `danger: false` for a neutral one.
- `useToast()`: `toast.success|error|info(title, description?)`.
- `apiErrorMessage(err, t)` turns any request error into text.
- `parseQty` (≥ 0) / `parseNumber` (negatives allowed) read typed numbers. Both accept `2,5`, return `null` for empty and `undefined` for invalid text (then show `toast.error(t.common.enterNumber)`).

**Which input:**

- Numbers and names inside tables → `CommitInput`.
- Text where an accidental change would hurt (task names) → plain `Input`s with an explicit Save button (`TaskEditor.tsx`).
- Several fields that are checked together (PINs) → a `<form>` with `FormField`s (`Settings.tsx` `PinForm`).

## Styling

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
  - The header hides the toolbar on `/counter` and `/checklist` (the `counting` check in `AppShell`). Add new phone-first pages there too.
- Icons come from `lucide-react` at `h-4 w-4`. Icon-only buttons need `aria-label` and `title`.

## Roles and modes

- `useAuth().can('setup' | 'tasks' | 'restore' | 'pins' | 'qr' | 'daily' | 'checklist' | 'count')` hides the controls a role can't use (see `ItemsCard`: `setup` shows rename/remove/add).
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
  - Call `vi.unstubAllGlobals()` in `afterEach`.
- Query by role and label (`screen.getByRole('button', { name: … })`) using the English text.
- Run one file: `cd client && npx vitest run src/pages/<File>.test.tsx | tail -30`.
- Before committing: `npm run lint && npm run typecheck && npm test`.

## Saving tokens

- Start from `docs/structure.md` and this skill. Don't list or read folders to "get a feel".
- Read big files in parts: `StockContext.tsx` (grep the method name), `en.ts` (grep the section), `db/sqlite/index.ts`.
- Copy the nearest existing component and change it. Don't design from scratch.
- Don't re-read files after editing them. Pipe test and build output through `| tail`.
- If a change shifts the structure (a new file, page or rule), update `docs/structure.md` in the same commit.
