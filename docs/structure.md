# Project structure

Read this instead of exploring the tree. Each line says what a file owns; open only the files your
change needs. Line counts are approximate and flag the files worth reading in parts (`grep -n`, then
`sed -n 'A,Bp'`). Never open `client/src/i18n/et.ts`/`ru.ts` (follow the `i18n` skill),
`package-lock.json`, `dist/` or `data/`. How things behave (data model, stock calculation, pages,
weak spots) is in `docs/behaviour.md`.

## Where to change X

| Change                                  | Files (in order)                                                                                                                                                                                                                                                                                                                                                      | Skill        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| New page                                | `client/src/pages/<Page>.tsx` (+ `pages/<page>/` for its parts) → route in `App.tsx` → `NAV` in `components/layout/AppShell.tsx` → `nav.*` text                                                                                                                                                                                                                       | `ui`, `i18n` |
| New UI text                             | `client/src/i18n/en.ts`, then `et.ts`/`ru.ts` at the same place                                                                                                                                                                                                                                                                                                       | `i18n`       |
| New stored value / field                | `shared/src/types.ts` + `schemas.ts` (`backupSchema`, `normalizeStockData`) → `server/src/db/types.ts` → `db/sqlite/` (migration + method) → route → `StockContext` → component                                                                                                                                                                                       | `sqlite-db`  |
| New request on existing data            | `shared/src/schemas.ts` (zod body) → `server/src/routes/<area>.ts` with `allow(perm)` → `StockContext` mutation → `server/tests/api.test.ts`                                                                                                                                                                                                                          | `auth`, `ui` |
| New permission / hide UI by role        | `shared/src/auth.ts` (`PERMISSIONS`, `FIXED`, `DEFAULT_ROLE_PERMISSIONS`) → `allow(perm)` on the route → `useAuth().can(perm)` in the UI                                                                                                                                                                                                                              | `auth`       |
| Stock rule (totals, consumption)        | `shared/src/stock.ts` + `stock.test.ts` only (pure; server and client both use it)                                                                                                                                                                                                                                                                                    | —            |
| Checklist rule (task history, ticks)    | `shared/src/checklist.ts` + `checklist.test.ts`                                                                                                                                                                                                                                                                                                                       | —            |
| Room-card rule (statuses, cleanings)    | `shared/src/rooms.ts` + `rooms.test.ts`                                                                                                                                                                                                                                                                                                                               | —            |
| Room card / room master setup UI        | `client/src/pages/rooms/` (`RoomCard`, `RoomTile`, `WhoDialog`, `CleaningHistory`, `RoomSearch`, `RoomFilters`, `LevelFilter`, `useRoomView`, `roomText.ts`, `roomView.ts`) · `pages/Cleaning.tsx` + `pages/cleaning/` · `pages/settings/RoomSetupCard.tsx` (+ `UnitGroups`, `MasterList`, `CleaningThresholds`, `RoomDialog`) · `roomMutations`/`roomSetupMutations` | `ui`, `i18n` |
| UI component used on more than one page | `client/src/components/ui/<Name>.tsx` + export in `components/ui/index.ts` + a case in `ui.test.tsx`                                                                                                                                                                                                                                                                  | `ui`         |
| Colour / utility class                  | `client/src/styles/index.css` (tokens on `:root` and `[data-theme='dark']`, `@utility` classes)                                                                                                                                                                                                                                                                       | `ui`         |
| Backup / restore format                 | `shared/src/schemas.ts` (`backupSchema`, must still read old files) → `db/sqlite/rows.ts` (`snapshot`, `fill`)                                                                                                                                                                                                                                                        | `sqlite-db`  |
| Excel export                            | `client/src/lib/excel.ts` (uses `math.series`)                                                                                                                                                                                                                                                                                                                        | —            |
| Env setting                             | `server/src/config.ts` → `.env.example` → `docker-compose.yml` → README                                                                                                                                                                                                                                                                                               | —            |
| A multi-session change                  | write `docs/plan-<topic>.md` with numbered steps                                                                                                                                                                                                                                                                                                                      | `plan-step`  |

## File map

### `shared/src/` (`@app/shared`, imported as TS source by server and client)

- `types.ts`: `StockData` and its parts (see "Data model" in `docs/behaviour.md`). `HISTORY_DAYS` (30) is the one history window: the date switcher (`DAYS_BACK`), `CHECKLIST_DAYS` and stock pruning use it.
- `schemas.ts` (211): the zod request schemas. `backupSchema` reads old-format backups with `''` blanks. `normalizeStockData`/`cleanRecord` make sure only real values get stored. `pruneChecklist` drops ticks and notes older than `CHECKLIST_DAYS`.
- `auth.ts`: roles (`admin`, `housekeeper`, `reception`, `counter`; `PIN_ROLES` = the first three), `PERMISSIONS`, the role matrix: admin everything, counter `count`, and the staff roles (`STAFF_ROLES` housekeeper/reception) get the four `STAFF_PERMISSIONS` (`daily`, `checklist`, `count`, `cleaning`) from `settings.rolePermissions` (`rolePermissionsSchema`; unset = `DEFAULT_ROLE_PERMISSIONS`: housekeeper `count` + `cleaning`, reception `checklist`, only the admin `daily`); `permissionsFor(role, settings)`, `can(role, perm, settings?)` (an unknown role, e.g. an old `worker` session, may do nothing; admin-only permissions can never be given), `todayOnly(role)`, `pinSchema`, login/link schemas.
- `stock.ts` (+ test): `createStockMath(state, { minDateStr })` → `dayFigures`, `calculateTotal`, `autoConsumption`, `roomSum`, `series`.
- `prune.ts` (+ test): `pruneStock(data, keepFrom)` drops stock data before `keepFrom` and turns the day before it into a carried-over count (`m` = that day's total), so no later figure changes. The SQLite driver calls it (`prune`).
- `checklist.ts` (+ test): `newTask`, `tasksOn`, `isTaskOn`, `editTask`, `removeTaskIn`, `pruneTasks`, `itemCheckKey`/`checkTaskId` (ticks of checklist lines). Groups: `taskGroupList` (never empty), `groupOf`, `tasksByGroup`, `moveTaskTo` + `applyTaskMove` (drag/arrow reorder, also into another group), `removeTaskGroupIn`.
- `rooms.ts` (+ test): room-card rules. `roomStatusList` (never empty: `DEFAULT_ROOM_STATUSES` while none is stored), `unitStatusOf` (missing = first status), `cleanThresholds`, `cleaningLevel(last, today, thresholds)` → `{ days, color }`, `latestCleaning`, `sortRooms` (natural), `removeUnitIn`/`removeStatusIn`/`removeTypeIn`/`removeRoomIn`, `pruneCleanings` (keeps each room's latest). Unit groups: `unitGroupOf`, `unitGroupList`, `unitsByGroup`, `moveUnitTo` + `applyUnitMove` (drag/arrow reorder, also into another group, as `moveTaskTo`), `removeUnitGroupIn` (not while it has units).
- `names.ts` (+ test): names in several languages. `NAME_LANGS` (en/et/ru), `LocalizedNames`, `displayName(entity, lang)` (the override, else the base name), `hasOwnName(entity, lang)` (a version stored for that language), `cleanNames` (normalize), `renameIn(entity, name, lang?)` (the rename rule), `createdName(name, lang?)` (the create rule), `localizeNames(data, lang)` (the dataset as shown, with `nameMissing`).
- `dates.ts`: local `YYYY-MM-DD` helpers (`formatDate`, `parseDateLocal`, `addDays`, `todayLocal`, `dateRange`). `index.ts`: barrel.

### `server/src/` (Express 5)

- `index.ts`: start-up order: config → `db.init()` → `seedPins` → listen, then a graceful shutdown. `app.ts`: middleware, `/api` routers, and serving `client/dist` (`/assets` is cached as immutable).
- `config.ts`: env validated with zod. `context.ts`: `{ config, db }` for the routes.
- `build.ts`: `{ builtAt, commit }` stamped by `tsup.config.ts` at build time (`commit: 'source'` when run from source), shown by `GET /health`.
- `auth/`:
  - `pins.ts`: scrypt hashes, `roleForPin`, `pinTakenBy` (the other role with this PIN), `seedPins` (a role without a PIN gets its env/default one; if another role already has it, the first free of `0000`/`1111`/`2222`… and a warning).
  - `sessions.ts`: the `sm_session` cookie (a SHA-256 of the token is stored).
  - `middleware.ts`: `session` (also reads the settings once per request into `req.settings`), `requireAuth`, `allow(perm)` (`can` with `req.settings`, so a role-permission change counts from the next request; sessions stay).
- `db/types.ts`: the `Db` interface (routes use only this). `db/index.ts`: creates the driver.
- `db/sqlite/`: the driver, split per area. Each repo file exports `createX(ctx)`, where `ctx = { all, get, run, prepare, transaction, write }` (`Ctx` in `rows.ts`).
  - `index.ts`: the connection, `write()`, `init`, `pruneStockRows` + `pruneCleaningRows` + `prune` (old ticks/notes/task history, stock data and room cleanings), `dailyBackup` (a JSON snapshot each day), `importJson`. `createSqliteDb`'s `today` option is the clock both use (tests move it);
  - `rows.ts`: the row types, `DATA_TABLES`, `Ctx`, `createRows` (`snapshot` rows → `StockData`, `fill` the reverse, and the shared read/write helpers) and `namedRepo`;
  - `items.ts` (items, groups, locations), `records.ts` (records, departures), `counts.ts`, `tasks.ts` (tasks, task groups), `checklist.ts` (ticks, notes), `settings.ts` (stock-card order, app settings; the cleaning thresholds are stored as text and read back as numbers), `rooms.ts` (room cards with unit statuses and cleanings, room units and their groups, room types, room statuses), `auth.ts`.
- `db/sqlite/migrations.ts`: numbered schema migrations.
- `routes/`:
  - `auth.ts`: login, me, logout, pins, QR create/revoke, link.
  - `checklist.ts`: tasks, task groups, checks, notes.
  - `daily.ts`: records, departures, counts.
  - `setup.ts`: items, groups, locations, the Stock page's card order (`PUT /stock-cards/order`) and the app settings (`PATCH /settings`).
  - `rooms.ts`: room cards (unit statuses, cleanings) and their master lists (units, statuses, types), each route with its own guard.
  - `data.ts`: `GET /data`, `POST /restore`.
  - `system.ts`: health.
- `seed/` (`npm run seed`, not part of the build):
  - `data.ts`: `seedData(today)`, deterministic demo data: 7 linen/amenity items, 3 departure groups (Single/Double/Family) with items per departure, 2 count locations, 14 days of departures, laundry income every 2 days and a starting count; 3 checklist groups of a day shift's admin tasks (Before 11, Service, End of shift) with ticks and a note; 29 room cards (001–002, 101–109, 201–209, 301–309) with types, 12 units in 3 groups (Bathroom, Electronics, Furniture; et/ru names on all but "Door lock" and "Safe", to show the untranslated colour), the default statuses + "Part ordered", a few issues, notes and cleanings (some overdue, two never).
  - `index.ts`: `seed(db, { force, today, backupDir })` refuses a database with data unless `force`, which first saves the old data as `backups/pre-seed-<time>.json` (restorable with Restore). PINs and sessions are kept.
- `lib/`:
  - `errors.ts`: `HttpError.*`.
  - `params.ts`: `param()`, `dateParam()` (a `YYYY-MM-DD` route param, else 400), `found()` (null/false → 404).
  - `logger.ts`.
- `middleware/`:
  - `validate.ts`: `validateBody(schema)` parses and replaces `req.body` (400 `BAD_REQUEST` with `details: [{ path, message }]`).
  - `error.ts`: `notFoundHandler` (unknown `/api` route → 404) and `errorHandler`: `HttpError` → `{ error: { message, code, details? } }` (`ApiErrorBody`), malformed JSON → 400, anything else → 500 `INTERNAL` (logged).
- `tests/`:
  - `helpers.ts`: app + temp DB per `setup()` call.
  - `api.test.ts` (310): the data routes. **One DB for the whole file** (`beforeAll`): each test sees what earlier tests left. A new test creates its own records (and removes them if later tests count rows) instead of changing the shared ones.
  - `auth.test.ts` (each role's allowed and refused routes, PIN changes, seeding), `qr.test.ts`, `roles.test.ts` (upgrading a DB with a `worker` PIN and session; the reception PIN collision), `rolePermissions.test.ts` (the editable staff matrix).
  - `rooms.test.ts` (room cards, statuses, cleanings, master lists), `unitGroups.test.ts`, `names.test.ts` + `createNames.test.ts` (the rename and create rules for names in several languages).
  - `sqlite.test.ts`: the driver, migrations, import and backups.
  - `seed.test.ts`: the demo data's shape, valid ids, positive totals, and the refuse/force rule.

#### API routes (all under `/api`)

Conventions: a create answers 201 with the entity, a delete 204, an update the entity (or the merged day); a missing row 404 (`found()`), a conflict 409, a bad body 400; every error is `{ error: { message, code, details? } }`.

- **`auth`:**
  - Login and sessions:
    - `POST /auth/login` `{ pin }` is rate-limited to 10 wrong PINs per 15 min.
    - `GET /me` → `{ role }`. `POST /logout`.
    - `PUT /pins` `{ role, pin }` is admin-only. The PIN must differ from every other role's (400), and it logs out that role's other sessions.
  - QR (admin-only):
    - `GET`, `POST` and `DELETE /qr`.
    - `POST` answers `{ token }` once, and revokes the old link and its sessions.
  - `POST /link` `{ token }` opens a `counter` session. That session may only `PUT` today's counts (`todayOnly`).
- **`checklist`:**
  - `/tasks`: `POST` (with `from`, optional `group`) and `PATCH /:id` (with `from`), `DELETE /:id/:date`, `PUT /order` `{ ids, move?: { id, group } }`.
  - `/task-groups` (`tasks` permission): `POST`, `PATCH /:id` `{ name }`, `PUT /order` `{ ids }`, `DELETE /:id` (its tasks move to the group above, or below for the first; the last group → 409).
  - `PUT /checks/:date/:taskId` `{ done, item? }` returns the day's ticks. `item` ticks one checklist line of the task's instructions instead.
  - `PUT /notes/:date` `{ text }`.
- **`setup`:** `/items`, `/groups`, `/locations`, each with POST/PATCH/DELETE (an item create and rename take `lang?`). `PATCH /settings`: a single cleaning threshold is checked against the stored other one (400 unless green < yellow); `rolePermissions` is the whole staff matrix (only staff permissions, else 400; equal to the defaults = the row is deleted).
- **`rooms`:**
  - `POST /rooms` `{ number, type?, note? }` needs `setup` (admin only). A duplicate number → 409.
  - `setup` (admin only) also: `PATCH /rooms/:id` (`type: ''`/`note: ''` clear), `DELETE /rooms/:id`, `PUT /rooms/:id/units/:unitId` `{ status, by, note? }`. A number another room has → 409.
  - `cleaning` permission (admin, housekeeper): `POST /rooms/:id/cleanings` `{ date, by }` (an earlier day is allowed and sorts behind later ones, a future day is 400; returns the room's cleanings, newest first).
  - `setup` permission: `/room-units`, `/room-unit-groups`, `/room-types` (`{ name, lang? }`) and `/room-statuses` (`{ name, color, lang? }`; `lang` on a create or rename: the names rule in `docs/behaviour.md`), each `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /order` `{ ids }`. Deleting the last status → 409. A unit is created in a group (`POST /room-units { name, group?, lang? }`; none or unknown = the first group, or a new default group); `PUT /room-units/order` also takes `move: { id, group }`. Deleting a unit group that still has units → 409.
- **`daily`:**
  - `PATCH /records/:itemId/:date`.
  - `PUT /departures/:groupId/:date`.
  - `PUT /counts/:date/:locationId/:itemId` returns the whole day's counts.
- **`data`:** `GET /data`, `POST /restore`. **`system`:** `GET /health` → `{ status, db, uptimeSec, builtAt, commit }` (use it to spot a stale build).

#### Server details

- **Env:**
  - `ADMIN_PIN`/`HOUSEKEEPER_PIN`/`RECEPTION_PIN` are the PINs on first start (default 1234/1111/0000; all set ones must differ). `WORKER_PIN` is the old name of `HOUSEKEEPER_PIN`.
  - Migration 6 renamed the old `worker` PIN and sessions to `housekeeper`.
  - `SQLITE_PATH` defaults to `data/stock.db`.
  - `BACKUP_DAYS` sets how long the daily `data/backups/db-YYYY-MM-DD.json` snapshots are kept. A snapshot is written before the first change of each day.
- **Old JSON data:** on the first start with an empty database, `JSON_DB_PATH` (the old `data/db.json`) is imported and renamed `db.json.imported`.
- **Sessions:** the `sm_session` cookie holds a random token (SHA-256 stored), is httpOnly and lasts 1 year. Auth rows live in `db.auth`, not in `StockData` or the backups.

### `client/src/` (React 19, Vite, Tailwind 4, React Router 7)

- `main.tsx`, `App.tsx`: the provider stack (I18n → Theme → Toast → Confirm → Auth → Date → Stock → Router) and the lazy route table.
- `context/`:
  - `AuthContext.tsx`: the session check, QR `?key=` exchange, Login screen until signed in. `useAuth()` → `{ role, can, ready, logout }`: `can` reads the role permissions from `PermissionsContext.ts` (filled by `StockProvider` from `data.settings`, so the poll picks up changes; `ready` is false until the first load, and `AppShell`/`HomeRedirect` don't redirect before it).
  - `StockContext.tsx` (**170**): the dataset (`data` with the names in the UI language via `localizeNames`, so pages read `.name`; `rawData` with every version, for Backup), polling (`POLL_MS`: all of `GET /api/data` every 15 s, kept on purpose since stock data is pruned to ~30 days), `send()` and `edit(key, fn)` (`useStock()`). See the `ui` skill. `StockContext.test.tsx`: optimistic edit, failure → toast + reload, a stale poll can't overwrite an edit (`version`), no poll while typing, `setCount` rethrows.
  - `stock/mutations.ts`: every mutation, grouped by area (setup, daily figures, checklist, settings, room cards, the rooms' master setup), built by `createMutations({ edit, send, data })` (`useMutations` memoizes it; a hook, so the React lint allows passing it `send`, which touches refs). `editData(prev, key, fn)` copies only the top-level key(s) an edit names; the rest is shared with the old dataset. `mutations.test.ts`.
  - `DateContext.tsx`: the selected day (−30…+7, locked in counter mode).
  - `I18nContext.tsx`: `useI18n()` → `{ t, locale, lang, setLang }`.
  - `ConfirmContext.tsx`: `useConfirm()`. `ToastContext.tsx`: `useToast()`. `ThemeContext.tsx`: light/dark and palettes.
- `components/ui/`: the UI kit (barrel `index.ts`; props are listed in the `ui` skill), including `AddForm` (a "new name" field + Add button) and `ClearableInput` (a `CommitInput` with × to clear a manual value). `ui.test.tsx`.
- `components/`:
  - `Salute.tsx`: the fireworks (a canvas over the page): a rocket rises from the bottom centre, bursts in the middle and its sparks spell a word. Skipped with reduced motion.
- `components/layout/`:
  - `AppShell.tsx`: sidebar, `NAV` (each entry's `perm`; a role lands on the first entry it has, or sees `NoPages` if none), header, counter-mode redirect, and the role redirect: a NAV page the role can't open (and `/`, via `HomeRedirect`) goes to its home page (admin `/stock`, housekeeper `/counter`, reception `/checklist`). Pages don't redirect themselves.
  - `PageHeader`, `DateSwitcher`, `LanguageSwitcher`, `ThemeToggle`, `PaletteToggle`.
- `pages/` (each file's details: the `ui` skill, "Page files"):
  - `Stock.tsx` + `stock/`: `DeparturesCard`, `ItemsCard`, `OverviewCard`, `StockCardHeader`, `GroupItemsModal`, `Legend`, `useRoomStatus`.
  - `Counter.tsx` + `counter/`: `AllRoomsTable`, `RoomCountList`, `RoomSwitcher`, `ManageRooms`, `useCountDrafts`.
  - `Checklist.tsx` + `checklist/`: `TaskGroupCard`, `TaskList`, `TaskEditor`, `ShiftNotes`, `NoteEditor`, `TaskNote`, `noteText.ts` (instructions format).
  - `Rooms.tsx` + `rooms/`: `RoomCard`, `RoomTile`, `WhoDialog`, `CleaningHistory`, `RoomSearch`, `LevelFilter`, `RoomFilters`, `useRoomView`, `roomText.ts`, `roomView.ts` (pure view rules, also for `/cleaning`).
  - `Cleaning.tsx` + `cleaning/`: `CleaningTile`, `CleaningFilters`, `useCleaningView`, `CleaningDialog`.
  - `Settings.tsx` + `settings/`: `PinForm`, `RolesCard`, `QrCard`, `DataCard`, `SaluteCard`, `RoomSetupCard` (+ `RoomDialog`, `UnitGroups`, `MasterList`, `CleaningThresholds`).
  - `Login.tsx` (PIN keypad), `NotFound.tsx`.
- `lib/`:
  - `api.ts`: `api.get/post/put/patch/delete`, `ApiError`, `apiErrorMessage(err, t)`; it fires `auth:expired` on 401.
  - `format.ts`: `formatLongDate(date, locale)` ("Sat, 17 Oct 2026").
  - `numbers.ts`: `parseQty` (≥ 0) and `parseNumber`, both accepting `2,5`.
  - `useDragSort.ts`: drag-a-grip (or ↑/↓) reordering; a vertical list (the checklist group cards), or with `free` rows that may sit side by side, dropped on the row under the pointer (the Stock page cards).
  - `useListsDragSort.ts`: the same over several lists (the tasks of the checklist group cards, the room units in their groups): a row dragged onto another list's area lands there (`target` shows the drop line); ↑/↓ past a list's edge goes to the neighbouring list.
  - `roomColors.ts`: `ROOM_COLOR_CLASSES`, room status colour id → `dot`/`text`/`soft`/`border` classes (`bg-status-green`…). `roomColors.test.ts` checks every colour has its tokens.
  - `backup.ts` (+ test): `hasData(data)` (anything to back up: stock, checklist or room setup) and `backupCounts(data)` (what Restore's confirmation lists).
  - `cn.ts`, `download.ts`.
  - `untranslated.ts`: `useUntranslated()` → `(entity) => { className, title }` marking a name with `nameMissing` (`text-untranslated` + the "not translated yet" tooltip), for the admin only (`useRole()`); `{}` otherwise. Used on item, room type, unit, unit group and status names (Stock items, Settings lists, room cards and tiles, the count pages).
  - `excelRows.ts` (+ test): `hasExcelData(data)` (items or room cards: the Excel button's "nothing to export" rule) and `cleaningSheet(data, today, never)`, the "Cleanings" sheet's rows, tested without ExcelJS.
  - `excel.ts` (the Excel export) and `qr.ts` (the QR code as SVG, PNG download and print): always dynamically imported, since ExcelJS alone is a ~1 MB chunk.
- `i18n/`: `en.ts` (the source; its shape is the `Messages` type), `et.ts`, `ru.ts`, `plural.ts`, `i18n.test.tsx`.
- `styles/index.css`: tokens (incl. the 10 room status colours `--status-<colour>` and `-soft`, light and dark), iOS 16px fields, and the `val-*` / `no-spin` utilities.
- `test/`: `setup.ts` (cleanup), `fetch.ts` (`mockApi`, `unauthorized`) and `fixtures.ts` (`stockFixture(extra)`: a small `StockData` with two items, three tasks and yesterday's note; `mockApp(role, data, route)`: `/auth/me` + `/data` + your routes; `today`, `yesterday`). Other tests sit next to their code: `src/CounterMode.test.tsx`, `src/Roles.test.tsx` (NAV, home page and redirects per role, `/stock` only with `daily`, the notice for a role with no page; `vi.resetModules()` gives each test a fresh router), `context/AuthContext.test.tsx`, `context/StockContext.test.tsx`, `context/localizedNames.test.tsx`, `pages/*.test.tsx` (incl. `MissingNames.test.tsx`: the admin's untranslated marks), `pages/settings/UnitGroups.test.tsx`.

### Root

- `deploy.sh`: backup, rebuild, health wait, rollback; deploys the `production` branch.
- `Dockerfile`, `docker-compose.yml`, `.env.example`.
- `docs/behaviour.md`: the data model, the stock calculation, each page's behaviour, the known weak spots.
- `docs/plan-*.md`: step plans (`plan-step` skill).
