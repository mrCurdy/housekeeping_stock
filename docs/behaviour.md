# Behaviour

How the app works: the data model, the stock calculation, each page and the known weak spots. Read
the section your change touches. Where the files are: `docs/structure.md`.

## Data model

`StockData` is also the backup file format. It's stored in SQLite tables (see the `sqlite-db` skill).

```
items:        [{ id, name, names?, multipliers: { [groupId]: qtyPerDeparture } }]
records:      { [itemId]: { [YYYY-MM-DD]: { c?, i?, m?, mc? } } }
groups:       [{ id, name }]
groupRecords: { [groupId]: { [YYYY-MM-DD]: { d } } }
locations:    [{ id, name }]                                   // rooms where stock is counted
counts:       { [YYYY-MM-DD]: { [locationId]: { [itemId]: number } } }   // missing = not counted
tasks:        [{ id, name, description, added?, removed?, earlier?: [{ name, description, until }], group? }]  // checklist, display order within a group
taskGroups:   [{ id, name }]                                   // checklist group cards, display order; never empty ('default', name '' = "Tasks")
checks:       { [YYYY-MM-DD]: { [taskId | taskId#lineKey]: ISO time ticked } }  // missing = not done
notes:        { [YYYY-MM-DD]: string }                         // note for the next shift
stockCards:   ['departures' | 'items' | 'overview']            // Stock page card order; [] = default, missing cards follow (stockCardOrder)
settings:     { saluteText?, cleanGreenDays?, cleanYellowDays?, rolePermissions? } // app-wide preferences (key/value table; rolePermissions as JSON); missing = default (DEFAULT_SALUTE_TEXT, DEFAULT_CLEAN_DAYS 15/29, DEFAULT_ROLE_PERMISSIONS; never stored equal to it)
rooms:        [{ id, number, type?, note? }]                   // room cards; shown level by level (sortByLevel); note ≤ ROOM_NOTE_MAX (500)
roomTypes:    [{ id, name, names? }]                                 // dropdown order
roomUnits:    [{ id, name, names?, group }]                          // master layout every room shares, display order within its group
roomUnitGroups: [{ id, name, names? }]                               // unit groups ("Bathroom"…), display order; [] only without units; 'units' (name '' = "Units") = where old units went
roomStatuses: [{ id, name, color, names? }]                          // color ∈ ROOM_COLORS (10, green/yellow/red first); [] = DEFAULT_ROOM_STATUSES
unitStatus:   { [roomId]: { [unitId]: { status, by, at, note? } } }  // current status only; missing = first status
cleanings:    { [roomId]: [{ date, by }] }                     // newest first; older than HISTORY_DAYS pruned except each room's latest
```

- **Names in several languages** (items, room types, room units and unit groups, room statuses; not stock groups, count locations, task groups, room numbers or notes): `name` is the base name (what was first typed; old data and backups have only it), `names?: { en?, et?, ru? }` the per-language versions (`names.ts`). Every language without a version shows the base name (`displayName`). `normalizeStockData` drops blank versions (one equal to the base is kept: it confirms the base text in that language). **Rename rule:** a rename sends the UI language (`lang` in the `PATCH` body) and changes only that version (`renameIn`; saving the base name stores it as that language's version); a body without `lang` sets the base name. **Create rule:** a create (`POST` of an item, room type, unit, unit group or status) also sends `lang` and stores the base name **and** that language's version (`createdName`), so a new name is never marked in the language it was typed in; the other languages fall back to the base and stay marked. A create without `lang` (old clients) sets only the base name. The client adds the same version to the created row, so the mark never flashes. Stored as a nullable `names` JSON column (migration 7, which leaves the old names untouched). **Missing translations (admin only):** a name is missing in a language without its own version there (`hasOwnName`), so every old name is missing in all three until the admin saves it in each; `localizeNames` sets `nameMissing: true` on it (shown data only, never stored or sent), except a never-renamed (no `names`) empty name (the default unit group, shown as "Units") or default status with its default name, which the app translates itself. The admin sees it in `text-untranslated` with a tooltip; Enter in its unchanged name field (`CommitInput confirmUnchanged`) saves it as that language's version.
- **Room unit groups:** every unit is in a group (`group`; missing or unknown = the default group `units`, `unitGroupOf`). `unitGroupList` = the stored groups plus that default while a unit needs it; `normalizeStockData` stores it, so an old backup's units all land in one unnamed group (migration 8 does the same for an old `stock.db`, creating the group only when units exist). A group with units can't be deleted (`removeUnitGroupIn` → 'notEmpty', 409). One `pos` orders all units (so also within a group), groups have their own.
- **Record fields:**
  - `d`: departures for a group on that day.
  - `c`: extra consumption, added on top of auto consumption (there's no UI for it at the moment).
  - `mc`: manual consumption, which replaces auto + extra.
  - `i`: income.
  - `m`: a manual stock count, which resets the running total to this value for that day.
- New IDs are UUIDs. Older data has timestamp IDs (`'1792…'`, `'g_…'`, `'l_…'`). Both are plain strings.
- Checklist ticks and notes older than `CHECKLIST_DAYS` (30) are deleted by the driver (the `pruneChecklist` rule, on start and with every write).
- Room cleanings older than `HISTORY_DAYS` are deleted by the same `prune`, except each room's latest (`pruneCleanings`; cheap check: a room with an old cleaning and more than one).
- **Stock data older than 30 days is removed; counts carry the totals over.** The driver's `prune` (on start, with every write, so also after a Restore) drops records, departures and room counts before `keepFrom` = today − `HISTORY_DAYS` − 2 (2 days before the oldest selectable day, for a server/client date difference around midnight) and writes the day before it, K, as one carried-over `m` per item (`pruneStock`). A cheap `date < K` check means it really runs about once a day; that day's backup was taken before it. The Excel export starts at the oldest selectable day, so K isn't exported.
- **Task changes apply from a day onwards** (the day shown on `/checklist`). Earlier days keep their list, wording and ticks.
  - A task is on day D when `added ≤ D < removed`.
  - `earlier` holds old wordings, each used before its `until`; the top-level name/description is the current one.
  - Removing a task on the day it was added deletes it. Otherwise it gets `removed` and loses only its ticks from that day on.
  - `pruneTasks` forgets history older than 30 days.
  - Groups and a task's group are not tracked per day: a rename or a move shows on past days too. A task without a (known) group is in the `default` group, or the first group once that is deleted (`groupOf`); new tasks store their group.
  - Tasks from before this existed have no `added` and show on every past day.
- **Task instructions** are plain text with note-app lists, nested by 2 spaces: `- item`, `1. item`, `- [ ] item` (`noteText.ts`).
  - A checklist line is ticked per day under `checks[date]['<taskId>#<key>']`. The key is a hash of the line's text (plus its occurrence), so rewording a line clears its tick.
  - Line ticks don't tick the task; the row shows "1/3" next to the name.
- **Removing things:**
  - a group drops its departures and multipliers;
  - an item drops its records and counts;
  - a room keeps its counts, which still count in the totals (shown as "Removed rooms").
  - a room unit drops its statuses on every card; a room status resets its units to the first status (the last one can't be removed); a room type is cleared on its cards; a room card drops its statuses and cleanings (`rooms.ts`).

## Stock calculation

`dayFigures(item, date, prevTotal)` is the single source of the stock rules.

- **End-of-day total**, in order of precedence:
  1. `m` (typed on the Stock page);
  2. `roomSum()` (the sum of that day's room counts, including removed rooms);
  3. the calculation `total = prevTotal + i - consumption`.
- **Consumption** is `mc` if set, otherwise auto + `c`, where auto = Σ over groups of `multipliers[g] × d`.
- A manual count `m` is intentionally the end-of-day figure, so that day's income and consumption are ignored (confirmed by the user).
- Totals are never stored.
  - `calculateTotal` replays from the latest count (`m` or room counts) on or before the day, since a count closes the past; with no count it replays from the earliest record date. Each item's counted days are listed once per `createStockMath`.
  - `series(item, toDate)` returns every day in one pass; the Overview and the Excel export use it.
- Negative totals are shortages (`val-short`).

## Pages

- **`/stock`:** three cards in the order in `stockCards`, then the legend. While Departures and Stock are next to each other they share a row on wide screens (1fr / 2fr, in their order); the Overview always takes a full row.
  - With `setup` permission (admin) each card header has a grip: drag it onto the card whose place it should take (the card follows the pointer and the target is outlined), or press ↑/↓ on it. The order is the same for everyone (`PUT /stock-cards/order`). Hidden cards (Departures without groups, Overview without items) keep their place in the saved order.
  - Departures per group (⚙ opens items-per-departure).
  - Items with Consumption / Income / Total stock for the selected day. × clears a manual value. The page needs `daily` (by default only the admin); the disabled fields with no × for a role without it remain as a fallback. Totals from room counts are blue, with a "2/3 rooms" caption.
  - The Overview (`OverviewCard`):
    - has one column per navigable day up to tomorrow (further only to the selected day or the last future day with an entry) and scrolls sideways with item names pinned, on a full-size scrollbar (`scrollbar-thick`);
    - centres the selected day;
    - shows "—" on days without consumption, income or a count (at the user's request).
    - an item's name opens it like a task's instructions: one row per room with that day's count ("—" when not counted), and a "Removed rooms" row when those have counts in view (the sum is the item's own row). The open list ends with a stronger border.
- **`/counter`** shows all rooms (items × rooms + Sum). **`/counter/:locationId`** is one room's list, so each floor bookmarks its own URL.
  - Typing creates a draft (`useCountDrafts`, kept in `Counter`, so switching rooms keeps unsaved numbers).
  - Save or Enter calls `setCount`, then focuses the next item.
  - Row states: empty / draft / saving / saved / error.
  - Leaving with unsaved drafts triggers `beforeunload`.
  - Saving a room's last uncounted item plays the fireworks (`Salute`); re-saving a counted item doesn't.
  - Rooms are managed under "Manage rooms".
- **`/checklist`:**
  - The same tasks every day, ticked per day (so each day starts empty), with the tick time shown. Tasks with a description open accordion-style.
  - Below them, "Notes for the next shift" shows the previous day's note read-only above this day's `CommitTextarea`.
  - Tasks are split into group cards ("Before 11", "Service"…), one `default` group to start with. Each card shows its own progress. With `tasks` permission: "Add group" below the cards; ✎ in a card's header renames it or deletes it (confirmed; its tasks move to the group above; the only group can't be deleted); the header grip drags the card (or ↑/↓). Roles without `tasks` don't see empty groups.
  - "New task" in each card adds to that group. While the whole checklist is empty the one card shows the empty state.
  - ✎ opens a task in place (`TaskEditor`: name, instructions, ↑/↓, remove, all from that day on). It saves only on Save, never on blur, because always-editable name fields led to accidental renames.
  - The instructions editor (`NoteEditor`) has buttons for bulleted / numbered lists, checklists, indent and outdent. Enter continues a list, Enter on an empty item ends it, Tab/Shift+Tab indent list lines.
  - When the user ticks a group's last task (not when a finished day is opened or polled), fireworks spell `settings.saluteText` (default "Tubli!"). Checklist lines inside instructions don't count.
  - With `tasks` permission each row has a grip: drag it (mouse or touch; the page scrolls near the screen edges), also onto another group's card (it gets a ring and a drop line), or press ↑/↓ on it (past a card's edge it moves to the neighbouring group). The order and the group are global (`PUT /tasks/order`), not per day.
- **`/rooms`** "Room statuses" (`setup` permission: admin only, anyone else is redirected to `/cleaning`; no general cleanings here): one card per room, level by level, then by number (`sortByLevel`), in a 1/2/3-column grid.
  - The search (shown when rooms exist, not remembered): "Enter a room number". Room numbers only (not types), from the first digit (`3` → 301, 315, not 103), any case; phones get the number keypad (`inputMode="numeric"`). While typed it searches every level (the selected level applies again once cleared); sort and hide-green still apply. × clears it.
  - The filter bar (shown when rooms exist; remembered per device): "All" or one level (the levels come from the rooms' first characters); the sort toggle Needs attention first (red, yellow, extra colours, green), pressing it again goes back to level order (an old stored cleaning sort loads as level order); "Hide all-green rooms" (only with units; unit statuses only, not the cleaning colour). When nothing matches: "No rooms match" with Show all (clears the search, resets the level and hide-green, keeps the sort).
  - Full cards or compact tiles (the "View" toggle in the bar, remembered with the filters; with nothing stored phones start compact). Compact: a dense grid of square tiles (number, type, wrench = worst unit status colour). Tapping a tile opens it as its full card on its own grid row (`col-span-full`; from `sm` up capped at `max-w-xl` and centred); only one is open, tapping another switches, × closes it. The open room isn't remembered and closes when the filters or search hide it.
  - A card: number, type, its note (saved on blur), each master unit (group by group, a small heading per group once there are several) with its status (missing = the first) tinted in the status colour, with the note, who and when of the last change.
  - Changing a status opens `WhoDialog` (name required, optional note). Cancel sends nothing.
  - ✎ edits the number and type, or deletes the card (confirmed). A number another card has shows an error.
  - Rooms are added only by the admin, in Settings. Without units: a notice (the admin gets an "Open Settings" link). Without rooms: an empty state pointing to Settings.
- **`/cleaning`** "Cleaning" (`cleaning` permission: admin and housekeeper; reception and the counter role don't get it): general cleanings in a dense grid of small square tiles (4 columns on a phone up to 12), the same on every screen (no Full / Compact).
  - A tile: the room number, and under it a broom with the days since the latest general cleaning (`0` today, counted from the real today, not the date switcher), coloured green / yellow / red by the thresholds; never cleaned = "—" in red. Its accessible name says it in words (`cleaningText`).
  - The room search as on `/rooms` (not remembered); the level buttons and "Dirty first" (most days first, never cleaned on top, ties in level order; pressed again = level order), both remembered per device. No match: "No rooms match" with Show all (clears the search and the level, keeps Dirty first).
  - Tapping a tile opens `CleaningDialog`: room number and type, the latest cleaning ("Cleaned 12 days ago · Anna" / "No general cleaning yet"), the last 10 cleanings, a required "Your name" (prefilled from `localStorage['rooms.who']`) and Cancel / Choose date / Cleaned today (on phones Cancel hides, the × closes, and the two share one row). Cleaned today: `POST /rooms/:id/cleanings` with today's date, then the fireworks play (`Salute`, the Settings text). Choose date: "When was room N cleaned?" with a date field (yesterday preset, `max` today) and Back / Mark cleaned: that day is sent (fireworks only if it is today); an earlier day goes behind any later cleaning, so the latest stays the latest. Cancel and Back send nothing.
  - No rooms: the admin gets an "Open Settings" link, the housekeeper "Ask the admin to set this up."
- **`/settings`** (admin only, `pins`; others are redirected to their home page):
  - The admin, housekeeper and reception PINs (each new PIN typed twice; another role's PIN → "Another role already has this PIN").
  - **Roles** (`RolesCard`): what housekeeper and reception may do (daily stock, checklist, inventory count, general cleaning), one checkbox per role; saved at once (`PATCH /settings { rolePermissions }`), Reset to defaults (disabled while they are the defaults). The NAV, redirects and server guards follow it.
  - The QR code for counting: Make (shown once, with Print and Download PNG), Make a new one (confirmed; revokes the old one) and Revoke. It encodes `${origin}/counter?key=<token>`.
  - **Data and backups** (`DataCard`; Settings is admin-only, so housekeeper and reception have no Excel or Backup):
    - **Excel:** from the oldest selectable day: a "Stock" sheet with one row per day and Consumption/Income/Stock per item, plus a "Departures" sheet when groups exist (both only with items and days with data), and a "Cleanings" sheet when room cards exist: one row per room, level by level (`sortByLevel`), with number, type, last general cleaning, days ago, who and the earlier kept dates (newest first); never cleaned → "never", days and who empty. It says "No data" only with neither items nor room cards.
    - **Backup:** a JSON download of everything, room cards, unit statuses and cleanings included. Refused ("No data to back up yet") only when `hasData` is false.
    - **Restore** (`restore` permission): validates with `backupSchema`, asks for confirmation (the file's items, departure groups, count locations and room cards with how many have cleanings, counts of 0 left out), then replaces everything: counts, room statuses and cleanings included.
  - The fireworks text (up to 12 characters, blank = "Tubli!"), with a Preview button. Saved for everyone (`PATCH /settings`, `setup` permission).
  - Room cards (`RoomSetupCard`, `setup` permission): "Add room" (a dialog: number, type, note; Cancel sends nothing), the "Rooms" list (level order; ✎ edits number/type/note in the same dialog, `PATCH` with only the changed fields, a number taken by another room refused before sending; 🗑 deletes the card with its unit statuses and cleanings after a confirm, counts stay), and the master layout every room shares. Units in groups ("Bathroom", "Electronics"…: add, rename in place, drag the grip or ↑/↓ to reorder groups; a group with units can't be deleted, a message says to move them first; units: rename in place, drag the grip (mouse or touch) or ↑/↓ to reorder and to move into another group, "Add unit" in each group, remove confirmed: drops their statuses on every card), statuses (name + a colour from the 10, green/yellow/red first; remove confirmed: its units go back to the first; the last one can't be removed), room types (remove confirmed: cleared on its cards), and the cleaning thresholds (green up to N days, yellow up to M, red above; 0 ≤ green < yellow, checked before saving).
- **Counter mode** (a QR session): `AppShell` drops the sidebar and menu and redirects every other path to `/counter`. The date is locked to today.

## Known weak spots

Still open. Fix one only when a task touches it.

- **`StockContext`:** any change re-renders every page that uses `useStock()`.
