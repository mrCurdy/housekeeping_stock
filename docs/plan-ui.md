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

- [ ] **3. Excel: a "Cleanings" sheet** (skills `ui`, `i18n`)
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

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `en.ts` is read in parts. Don't read ExcelJS types beyond what the sheet needs.
- Run single test files while working, the full suite once at the end (`| tail -30`).
