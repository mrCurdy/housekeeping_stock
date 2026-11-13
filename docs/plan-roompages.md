# Plan: split rooms into a statuses page and a cleaning page

Do one step per session with the `plan-step` skill ("do step N of docs/plan-roompages.md"), or all
of them with `run-stage`. Every step ends green (`npm run lint && npm run typecheck && npm test`)
and makes one commit. Steps run in order.

## Context

Today `/rooms` shows one card per room with both the unit statuses and the general-cleaning line,
for admin and worker. The user wants two pages built on the same room data:

- **Room statuses** (admin only): the unit statuses of every room.
- **Cleaning** (admin and worker): register and monitor general cleanings, in a minimal view.

No storage change: rooms, unit statuses and cleanings stay as they are (`shared/src/rooms.ts`,
`db/sqlite/rooms.ts`). Only permissions, routes and the client change.

## Decisions (confirmed with the user)

- **Permissions:**
  - Unit statuses, the room note and the ✎ editor (number, type, delete) become **admin only**:
    `PATCH /rooms/:id`, `DELETE /rooms/:id` and `PUT /rooms/:id/units/:unitId` need `setup`
    (as `POST /rooms` already does).
  - The `rooms` permission is renamed **`cleaning`** and covers only `POST /rooms/:id/cleanings`
    (admin and worker). `GET /data` stays as it is: both roles keep reading all room data.
- **Room statuses page** stays at **`/rooms`**, NAV label "Room statuses", `perm: 'setup'`. A
  non-admin opening `/rooms` is redirected to `/cleaning` (like `Settings` redirects).
  - Cards keep the number, type, the note, the unit statuses and ✎. The **cleaning line,
    Cleaned button and history leave the card.**
  - Search, level buttons, hide-green and the Full / Compact toggle stay. The sorts are only
    **Needs attention first** (on/off; off = level order). "Recently cleaned first/last" are gone;
    a stored old sort value (`cleanedNew` / `cleanedOld`) loads as level order.
  - Compact tiles show the number, type and the wrench only (no broom).
- **Cleaning page** at **`/cleaning`**, NAV label "Cleaning" (icon `Brush`), `perm: 'cleaning'`,
  for admin and worker. Shown as a dense grid of small **square tiles** on every screen (no
  Full / Compact toggle).
  - A tile: the room number, and below it a **broom icon with a coloured number next to it** = the
    days since the room's latest general cleaning (`0` today), coloured by `cleaningLevel`
    (green / yellow / red, `text-status-*` tokens). Never cleaned → "—" in red. The tile's
    accessible name says it in words (`cleaningText`, e.g. "Room 101, cleaned 12 days ago").
  - Tools: the **search** (same rules as `/rooms`, not remembered), the **level buttons**, and
    one toggle **"Dirty first"**: most days since cleaning first, never-cleaned at the very top,
    ties by level order; off = level order. Level and dirty-first are remembered per device
    (`localStorage['cleaning.view']`, try/catch). No "clean first" sort, no hide toggle. "No rooms
    match" + Show all as on `/rooms`.
  - **Tapping a tile opens a dialog** (`Modal`): room number and type, the latest cleaning ("Cleaned
    12 days ago · Anna" / "No general cleaning yet"), the history (last 10, newest first, as the card
    showed it), a **who** field (prefilled from `localStorage['rooms.who']`, required) and
    **Cancel / Cleaned today**. Confirm calls the existing `markCleaned(roomId, by)` and closes.
  - No rooms: the admin gets an "Open Settings" link, a worker "ask the admin" (as `/rooms` now).
- Workers and the admin's other pages are unchanged. The counter (QR) role gets neither page.

## Steps

- [x] **1. Permissions: statuses and card edits admin-only, `rooms` → `cleaning`** (skill `auth`)
  - `shared/src/auth.ts`: rename the permission `rooms` → `cleaning` (worker keeps it); update the
    comment: `cleaning` = register general cleanings; room cards (note, number, type, delete, unit
    statuses), adding rooms and the master layout = `setup`.
  - `server/src/routes/rooms.ts`: `PATCH /rooms/:id`, `DELETE /rooms/:id`,
    `PUT /rooms/:id/units/:unitId` → `allow('setup')`; `POST /rooms/:id/cleanings` →
    `allow('cleaning')`.
  - Client: replace every `can('rooms')` / `perm: 'rooms'` with the right one so the app still
    works as before for the admin (the page split comes in steps 3–4; until then the `/rooms` NAV
    entry uses `setup`, so the worker temporarily loses it).
  - Tests: `server/tests/auth.test.ts`: a worker gets 403 on the room PATCH, DELETE and unit status
    PUT, and still 201/200 on a cleaning; `rooms.test.ts` worker cases changed to match (statuses as
    admin, cleanings as worker). `shared` auth tests if they list the matrix.
  - Docs: the `auth` skill matrix, `docs/structure.md` API lines for `/rooms`.
  - Done. `Rooms.test.tsx`: the worker cases now run as admin; the worker-redirect test sits last in
    the file (the App's router keeps its location between tests); the worker half of the "no rooms"
    test was dropped (step 4 covers it on `/cleaning`).

- [x] **2. The view rules for both pages, pure** (skill `ui`)
  - `pages/rooms/roomView.ts`: `RoomView.sort` becomes `'number' | 'attention'` (drop
    `cleanedNew` / `cleanedOld` and their code). `useRoomView` reads a stored old sort as
    `'number'`.
  - New `viewCleaning(data, { level, dirtyFirst, search? }, today)`: the level filter and search as
    in `viewRooms` (a search replaces the level while typed), dirty-first = days since
    `latestCleaning` descending, never-cleaned first, ties by `sortByLevel`; off = `sortByLevel`.
    Plus `cleaningDays(data, roomId, today)` → `{ days: number | null, color }` from
    `cleaningLevel` for the tile.
  - Tests in `roomView.test.ts` (+ `useRoomView.test.ts`): dirty-first order with never-cleaned on
    top and ties by level; a search across levels; days/colour at the green/yellow/red thresholds;
    an old stored `cleanedOld` view loads as `'number'`.
  - The Rooms page filter bar loses the two cleaning sorts here (its tests updated), so the step
    stays green.
  - Done. `viewCleaning` takes a `CleaningQuery` type (exported from `roomView.ts`). The now-unused
    `rooms.filter.cleanedNew` / `cleanedOld` texts were removed from en/et/ru here, not in step 3.

- [ ] **3. Room statuses page (admin only)** (skills `ui`, `i18n`)
  - `Rooms.tsx`: redirect to `/cleaning` without `setup` (route only exists after step 4: until
    then redirect to `/stock`, and step 4 changes it). NAV label "Room statuses" (`nav.rooms`
    text in en/et/ru), `perm: 'setup'`.
  - `RoomCard.tsx`: remove the general-cleaning line, Cleaned button and history expander (move
    the history list into its own `pages/rooms/CleaningHistory.tsx` for step 4). `RoomTile.tsx`:
    remove the broom. `RoomFilters`: only "Needs attention first" as sort.
  - Remove text keys that become unused (check each with grep).
  - Tests in `Rooms.test.tsx`: no cleaning line or Cleaned button on a card; tiles have no broom;
    the attention toggle still sorts; a worker opening `/rooms` is redirected.
  - Docs: `docs/structure.md` (`/rooms` section, file map).

- [ ] **4. Cleaning page** (skills `ui`, `i18n`, `auth`)
  - New `pages/Cleaning.tsx` (+ test), lazy route `/cleaning` in `App.tsx`, `NAV` entry
    "Cleaning" (icon `Brush`, `perm: 'cleaning'`) next to "Room statuses". Change step 3's `/rooms`
    redirect for non-admins to `/cleaning`.
  - New in `pages/cleaning/`: `CleaningTile.tsx` (square button: number, broom + coloured days),
    `CleaningFilters.tsx` (level buttons + "Dirty first", reusing the level-button part of
    `RoomFilters` if it splits cleanly), `useCleaningView.ts` (`localStorage['cleaning.view']`),
    `CleaningDialog.tsx` (latest cleaning, `CleaningHistory`, who field, Cancel / Cleaned today).
    Reuse `RoomSearch` and `cleaningText`.
  - Text in en/et/ru under `cleaning.*` (`nav.cleaning`, the toggle, dialog title/buttons, tile
    label, empty states).
  - Tests in `pages/Cleaning.test.tsx`:
    - tiles show the number and the coloured days (`0` today, a red overdue one, "—" never cleaned);
    - "Dirty first" reorders (never-cleaned first) and pressing it again restores level order;
    - level buttons and search filter; "No rooms match" → Show all;
    - tap → dialog shows the latest cleaning and history; Cleaned today sends
      `POST /rooms/:id/cleanings` with today's date and the name, and the tile shows `0`; Cancel
      sends nothing; an empty name can't confirm;
    - a worker sees the page and the NAV entry; a worker's NAV has no "Room statuses".
  - Docs: `docs/structure.md` (file map `pages/cleaning/`, a `/cleaning` page section, the "Where
    to change X" row for rooms), README's page list, the `ui` skill if it lists pages.
  - Manual check with `npm run dev` (or say it wasn't done): worker PIN 0000 marks a room cleaned
    from a tile on phone width; admin sees both pages; dark mode colours readable.

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `RoomCard.tsx` is long: read only the parts you change. `en.ts` is read in parts.
- Run single test files while working, the full suite once at the end (`| tail -30`).
