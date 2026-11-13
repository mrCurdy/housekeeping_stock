# Plan: data buttons move to Settings; backups catch up with rooms

Do one step per session with the `plan-step` skill ("do step N of docs/plan-ui.md"), or all of
them with `run-stage`. Every step ends green (`npm run lint && npm run typecheck && npm test`) and
makes one commit. Steps run in order.

## Context

The header toolbar (`components/layout/DataMenu.tsx`, rendered in `AppShell.tsx`) has **Excel**,
**Backup** and, for the admin, **Restore**. The user wants them in **Settings** instead.

Analysis of backups after the room pages (`docs/plan-roompages.md`, done):

- **Format and server: no change needed.** `StockData`/`backupSchema` already carry `rooms`,
  `roomTypes`, `roomUnits`, `roomStatuses`, `unitStatus`, `cleanings` and the cleaning thresholds
  in `settings`. `snapshot`/`fill` (`db/sqlite/rows.ts`) write and read all of them, the daily
  `data/backups/db-YYYY-MM-DD.json` snapshot uses `snapshot`, and old backups without rooms load
  (`sqlite.test.ts`, `rooms.test.ts`). The page split changed only permissions and the client.
- **Client gaps:**
  - **Backup refuses a hotel that only has rooms**: `backup()` says "No data to back up yet"
    unless items, groups or tasks exist. Room cards, unit statuses and cleanings are ignored.
  - **Excel refuses without items** (`data.items.length === 0`), and it has **no room data** at
    all. The cleaning history is pruned to each room's latest cleaning after `HISTORY_DAYS`
    (`pruneCleanings`), so an Excel sheet is the easy way to keep a record.
  - **Restore's confirmation is misleading**: "contains N items, N groups and N rooms" counts
    the stock count **locations** as "rooms", while "rooms" now means the room cards. It doesn't
    mention room cards or cleanings at all.

## Decisions (confirmed with the user)

- **Excel, Backup and Restore live only in Settings**, in a new "Data and backups" card. The
  header no longer has them. Settings is admin-only (`can('pins')` redirect), so **workers lose
  Excel and Backup**. No server change: `GET /data` stays open to both roles (the app needs it);
  `POST /restore` keeps `allow('restore')`.
- **Excel gets a "Cleanings" sheet:** one row per room (level order, `sortByLevel`): number, type,
  last cleaning date, days ago, who, and the earlier dates still kept. Never cleaned → the date
  cells say "never". Added whenever rooms exist.

## Steps

- [x] **1. A "Data and backups" card in Settings; the header loses the buttons** (skills `ui`,
      `i18n`)
  - New `pages/settings/DataCard.tsx`: the Excel, Backup and Restore logic from `DataMenu.tsx`
    moved as is (lazy `@/lib/excel`, `downloadBlob`, `backupSchema` check, confirm, `restore`).
    A card with a title, a short description (what Backup and Restore do, and that the server also
    keeps a daily copy for `BACKUP_DAYS`, without the env name), and the three buttons as normal
    labelled `Button`s (not icon-only ghost buttons). Restore stays behind `can('restore')`.
  - `Settings.tsx`: render `DataCard` (after the PIN/QR cards, before the room setup; check
    the page's order and keep it readable on phones).
  - Delete `components/layout/DataMenu.tsx` and its slot in `AppShell.tsx`, plus the `counting`
    logic that only hid the toolbar on phones (keep it if something else uses it).
  - Move the `data.*` texts if they need a card title/description (`settings.data.*` or keep
    `data.*`); en/et/ru. Remove text that becomes unused (hint tooltips if the buttons are
    labelled).
  - Tests in `pages/Settings.test.tsx`: the card shows Excel, Backup, Restore; Backup downloads a
    JSON file (mock `downloadBlob`); Restore with a valid file → confirm → `POST /restore`; a
    non-backup file → error toast, nothing sent. A header check (e.g. in an `AppShell` or page
    test): no Backup/Excel/Restore buttons for admin or worker. Update `CounterMode.test.tsx` if
    it looks for the toolbar.
  - Docs: `docs/structure.md` (file map: `DataMenu` gone, `DataCard` in `settings/`; the
    "Header toolbar" section → the Settings section), README "Data and backups" (Backup/Restore/
    Excel are in Settings, admin only).

  - Done: texts stay under `data.*` (+ `data.title`, `data.description`; the three `*Hint` keys removed). The description says "30 days (by default)": the client doesn't know `BACKUP_DAYS`. Buttons are `outline`. The header check is in `Stock.test.tsx` ("header").

- [x] **2. Backup and Restore know about rooms** (skills `ui`, `i18n`)
  - New pure `hasData(data)` (in `client/src/lib/` or `shared/src/`, + test): true when any of
    items, groups, locations, tasks, rooms, room types/units/statuses exist. Backup uses it; with
    nothing at all it still says "No data to back up yet".
  - Restore's confirmation: say what the file has in words people use now: items, departure
    groups, count locations, room cards (and how many rooms have cleanings), "This replaces ALL
    current data, including counts, room statuses and cleanings." Drop counts that are 0 if that
    reads better. en/et/ru with plurals (`p(...)` as in the current text).
  - Server: a test in `server/tests/api.test.ts` that a backup with room cards, unit statuses,
    cleanings and the thresholds goes through `POST /restore` and `GET /data` unchanged (check
    first: if `sqlite.test.ts`'s `sample()` already has room data and an API restore test exists,
    only add what's missing).
  - Tests: `DataCard` Backup with only rooms downloads; the confirmation text names room cards.
  - Docs: `docs/structure.md` Settings section.

  - Done: `hasData`/`backupCounts` in `client/src/lib/backup.ts`. `restoreDescription(file, counts)` takes a `BackupCounts` object and lists the non-zero counts separated by commas (no "and", so no per-language joining); a file with nothing says it is empty. The server needed no change (new restore test passes as is).

- [x] **3. Excel: a "Cleanings" sheet** (skills `ui`, `i18n`)
  - New pure `cleaningSheet(data, today)` next to `lib/excel.ts` (e.g. `lib/excelRows.ts`, +
    test, so the rows are tested without ExcelJS): rows in `sortByLevel` order with room number,
    type name, latest cleaning date (local `YYYY-MM-DD`), days ago (`cleaningLevel`), who, earlier
    kept dates (newest first, comma-separated). Never cleaned → date "never" (from `t.excel`),
    days and who empty.
  - `excel.ts`: add the sheet when rooms exist (frozen header row, column widths like the
    others). The Stock sheet only when items exist; the export returns false only when neither has
    anything. `DataCard`'s `data.items.length === 0` check becomes the same rule.
  - Text: `excel.cleaningsSheet` and the column headers in en/et/ru.
  - Tests: `cleaningSheet` order, a never-cleaned room, days ago, earlier dates; Excel with
    rooms but no items no longer says "No data".
  - Docs: `docs/structure.md` (`excel.ts` line and the Settings section), README's Excel line.

  - Done: `lib/excelRows.ts` also has `hasExcelData(data)` (items or rooms), used by `DataCard`. Items without days of data still give "No history" unless rooms exist. A never-cleaned room's date cell is red italic.

- [x] **4. Login on phones: the keypad without the OS keyboard** (skill `ui`)
  - Problem: on a phone the PIN screen shows the on-screen keypad, and the OS keyboard opens on top
    of it. Cause: the PIN `<input>` in `pages/Login.tsx` has `autoFocus`, and `submit()` calls
    `input.current?.focus()` after a wrong PIN.
  - Fix: on a touch device (`matchMedia('(pointer: coarse)')`, guarded when `matchMedia` is
    missing, as in `useRoomView.ts`) don't focus the field: no `autoFocus`, no refocus after a
    wrong PIN. Desktop keeps both (typing straight away). Keep the field itself and
    `inputMode="numeric"`: tapping it still opens the keyboard on purpose, which is how the
    browser's saved password gets filled. Don't use `inputMode="none"` (it would block that).
  - Tests in `pages/Login.test.tsx` (stub `matchMedia`): coarse pointer → the field isn't focused
    on open nor after a wrong PIN; fine pointer → focused on open and after a wrong PIN. The
    keypad still logs in on both.
  - Docs: `docs/structure.md` `Login.tsx` line (phones: not focused, so only the keypad shows).

  - Done: the refocus after a wrong PIN moved into a `useEffect` on `busy`/`error`: the old
    `focus()` ran while the field was still disabled, so it never worked.

- [x] **5. Edit and remove rooms in Settings** (skills `ui`, `i18n`)
  - Today Settings can only **add** a room card (`AddRoomDialog`); editing the number/type and
    deleting a card happen only on /rooms (`RoomCard`'s ✎). The server and `StockContext` already
    have everything: `updateRoom(id, patch)`, `removeRoom(id)` (`PATCH`/`DELETE` rooms, both
    `allow('setup')`). **No server change.**
  - `RoomSetupCard.tsx`: a "Rooms" list under the "Add room" button (before the units/statuses/
    types columns), in `sortByLevel` order: number, type name (or nothing), and per row ✎ Edit
    and 🗑 Remove icon buttons with `aria-label`s naming the room. Many rooms → keep it compact
    (a wrapped grid of small rows, or a scroll box with a max height); readable on phones. No rooms
    → a one-line empty text.
  - Edit: turn `AddRoomDialog` into `RoomDialog` with an optional `room` prop (edit mode: title
    "Edit room N", fields prefilled, Save instead of Add). It sends only the changed fields
    (`type: ''` / `note: ''` clear them, as `RoomPatchInput` says). A number taken by **another**
    room shows the error before sending (`roomExists` must skip the room itself). Rename the file
    and its uses; keep one dialog, not two.
  - Remove: confirmed (`useConfirm`), reusing `t.rooms.removeTitle(number)` /
    `removeDescription` (it deletes the card's unit statuses and cleanings; counts stay).
  - Text: `settings.rooms.roomList`, `noRooms`, `editRoomTitle(n)`, the row aria-labels; en/et/ru.
    Reuse existing `rooms.*`/`common.*` strings where they fit.
  - Tests in `pages/Settings.test.tsx` (or a `RoomSetupCard` test): the list shows rooms in level
    order; Edit changes the number and type → `PATCH` with only the changed fields; a taken number
    → error, nothing sent; keeping its own number is allowed; Remove → confirm → `DELETE`; cancel
    → nothing sent.
  - Docs: `docs/structure.md` file map (`RoomDialog` replaces `AddRoomDialog`) and the Settings
    section; the `RoomSetupCard` doc comment.

  - Done: the row aria-labels reuse `rooms.edit(n)` / `rooms.remove(n)` ("Edit room N" / "Delete room N"), so only `settings.rooms.roomList`, `noRooms` and `editRoomTitle` are new. Edit closes at once (optimistic `updateRoom`); Save with nothing changed sends nothing.

- [x] **6. Split the worker role into Housekeeper and Reception** (skills `auth`, `sqlite-db`,
      `ui`, `i18n`)
  - Decisions (confirmed with the user): `worker` is replaced by two PIN roles, **housekeeper**
    (ru "горничная") and **reception** (ru "консьерж"; en "Reception", et "Vastuvõtt" — check the
    wording with `i18n`). Defaults: housekeeper `cleaning`, `count`; reception `checklist`.
    Nobody but the admin has `daily` by default. `counter` (QR) is unchanged. The permissions become
    editable in step 7; this step uses these defaults as a fixed matrix.
  - `shared/src/auth.ts`: `ROLES = ['admin', 'housekeeper', 'reception', 'counter']`,
    `PIN_ROLES = ['admin', 'housekeeper', 'reception']`, the matrix above, the doc comments.
  - PINs: fresh install defaults admin `1234`, housekeeper `1111`, reception `0000`.
    `config.ts`: `HOUSEKEEPER_PIN`, `RECEPTION_PIN` (keep `WORKER_PIN` as an alias of
    `HOUSEKEEPER_PIN` so old `.env`s still work); all set PINs must differ. `.env.example`,
    `docker-compose.yml` if it lists them.
  - Migration (`db/sqlite/migrations.ts`): the `pins` row `worker` → `housekeeper` (the old worker
    PIN keeps working as the housekeeper PIN); sessions with role `worker` → `housekeeper`.
    `seedPins` then gives reception its default; if that PIN is already taken (an upgraded hotel
    whose worker PIN is `0000`), it takes the first free default of `0000`/`1111`/`2222`… and logs
    it, so the PINs always differ. `roleForPin` and the "PINs must differ" check in
    `routes/auth.ts` (`other = PIN_ROLES.find(...)`) must compare against **all** other roles.
  - Client: `PinForm` / Settings show three PIN forms (Admin, Housekeeper, Reception) with the
    "every device of this role is logged out" hint. NAV in `AppShell.tsx`: `/counter` needs
    `count`, `/checklist` needs `checklist` (so a role only sees pages it can use; `/stock` stays
    for all — check its read-only state without `daily`). A route the role can't use redirects to
    the first page it can (e.g. reception lands on /checklist).
  - Text: role names and PIN labels/toasts in en/et/ru (`settings.pins.*`: replace `worker*`).
  - Tests: `shared` `can()` for each role; server: housekeeper/reception login, each allowed and
    denied route (one per permission is enough), the migration of an old DB with a `worker` PIN and
    session, the reception PIN collision, PIN change refusing any other role's PIN. Client:
    Settings shows three PIN forms; NAV per role. Update every test that logs in as `worker`.
  - Docs: `docs/structure.md` (role matrix, auth section), `.claude/skills/auth`, CLAUDE.md's
    first-start PINs line and the README.

  - Done: the home page is the first NAV entry a role may land on; `/stock` lands only with `daily`
    (`home: 'daily'`), so admin → /stock, housekeeper → /counter, reception → /checklist. `AppShell`
    does every role redirect (also for `/rooms`, `/cleaning`, `/settings`; their own `Navigate`s
    are gone, so a housekeeper on /rooms now lands on /counter, not /cleaning). Without `daily` the
    Stock figures and departures are disabled fields. PIN texts are keyed by role
    (`settings.pins.label/hint/changed[role]`); no separate role-name texts yet (step 7's
    RolesCard can add them). A PIN change error says "Another role already has this PIN".
    `seedPins`' spare-PIN fallback applies to any role whose env/default PIN is taken.

- [ ] **7. Role permissions editable in Settings** (skills `auth`, `sqlite-db`, `ui`, `i18n`)
  - Decision (confirmed with the user): the admin can change what housekeeper and reception may
    do; the defaults are step 6's. Only the four staff permissions are editable: `daily`,
    `checklist`, `count`, `cleaning`. Admin-only ones (`setup`, `tasks`, `restore`, `pins`, `qr`)
    stay admin-only; `admin` and `counter` aren't editable.
  - `shared`: `STAFF_PERMISSIONS`, a zod schema `rolePermissions: { housekeeper: Permission[],
    reception: Permission[] }` (only staff perms), stored in `AppSettings` (so backups carry it;
    a missing value = the defaults; `normalizeStockData` drops it when equal to the defaults).
    `can(role, perm, settings?)` (or a `permissionsFor(role, settings)` helper) reads it, used by
    the server guard and the client alike.
  - Server: `allow(perm)` reads the current settings (one cached read per request is fine).
    Changing them goes through the existing settings update (`allow('pins')`). Sessions stay
    valid; the next request just sees the new permissions.
  - Client: `AuthContext`/`useAuth().can` uses the settings from `StockContext` (the 15 s poll
    picks up changes). A "Roles" card in Settings (`settings/RolesCard.tsx`): a small table, rows =
    the four permissions with a one-line explanation, columns = Housekeeper, Reception, checkboxes.
    "Reset to defaults" button. Readable on phones.
  - Text: card title/description, permission names and explanations; en/et/ru.
  - Tests: shared `can` with overrides; server: turning `daily` on for reception lets it
    `POST` a departure, turning `cleaning` off for housekeeper → 403; a non-staff perm in the
    payload is refused (400); backup/restore keeps the overrides. Client: the card saves a change,
    NAV follows it.
  - Docs: `docs/structure.md` (settings, role matrix), `.claude/skills/auth`.

- [ ] **8. Mark a room cleaned on a chosen date** (skills `ui`, `i18n`)
  - Request (from the user): the date a room was cleaned can be chosen, not only today. Where a
    room is marked cleaned (the Cleaning page tile/dialog), show two buttons side by side: on the
    left **Choose date** (`variant` secondary) opens a date picker (local `YYYY-MM-DD`, not in
    the future) and marks the room cleaned on that date; on the right **Cleaned today** (primary)
    keeps today's behaviour (fireworks included). On phones both stay on one row.
  - If the server/`StockContext` mutation can't take a date yet, add it through the layers (shared
    zod → `Db` → route with its existing `allow(perm)`), keeping the last-cleaned rule from
    `docs/structure.md` (a past date must not overwrite a later cleaning).
  - Text: button labels, picker title; en/et/ru.
  - Tests: client: Choose date marks the room cleaned on the picked date, Cleaned today on today;
    server (if changed): a past date is stored, a future date is refused (400).
  - Docs: `docs/structure.md` (Cleaning page).

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `en.ts` is read in parts. Don't read ExcelJS types beyond what the sheet needs.
- Run single test files while working, the full suite once at the end (`| tail -30`).
