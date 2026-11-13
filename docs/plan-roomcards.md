# Plan: room cards (unit statuses and general cleaning per room)

Do one step per session with the `plan-step` skill ("do step N of docs/plan-roomcards.md"), or all
of them with `run-stage`. Every step ends green (`npm run lint && npm run typecheck && npm test`)
and makes one commit. Steps run in order.

## Context

Housekeeping wants to monitor rooms: what in each room needs attention, and when it last had a
general cleaning. A new `/rooms` page shows one card per room. The admin sets up, in Settings, the
master layout every room shares (units, statuses, room types, cleaning thresholds). Admin and
workers use the page every day.

## Decisions (confirmed with the user)

- **Room card:** title = room number, header = room type. Units listed in master order, each with
  its status. Below: the general-cleaning line and a **Cleaned** button.
- **Room note:** each card has its own short description ("sea view, connecting door to 204",
  "bathtub, no shower"). Plain text, up to 500 characters, shown under the header. Anyone with
  `rooms` edits it in place (`CommitTextarea`, saved on blur like the shift notes). No dialog and no
  name. Blank = no note (not stored).
- **One master layout for all rooms.** Units are the same in every room; a card can't add or hide
  units. Adding a unit in Settings adds it to every card; removing it removes its statuses.
- **Room types** are a list in Settings (Single, Double, Suite…); a card picks one (or none).
  Removing a type clears it on its cards.
- **Statuses:** any number, ordered, each with a name and a colour from a fixed palette of 10:
  the 3 main ones first (green = ok, yellow = needs attention but usable, red = needs fixing) and
  7 additional ones. Default list (fixed ids, used while none is stored, like `taskGroupList`):
  OK/green, Needs attention/yellow, Needs fixing/red. A unit with no stored status shows the
  **first** status. Deleting a status (confirmed) resets its units to the first; the last status
  can't be deleted (409).
- **Changing a unit's status** opens a dialog: who (required), note (optional), Cancel/Confirm.
  The unit then shows the status, note, who and when.
- **Cleaned** opens the same dialog without the note: cleaner name, Cancel/Confirm. A new card
  shows "No general cleaning yet" (red). After that: "Cleaned N days ago · Name" (today /
  yesterday wording), coloured by the thresholds.
- **Thresholds** (Settings, adjustable): green up to `cleanGreenDays` (default 15), yellow up to
  `cleanYellowDays` (default 29), red above. Validation: 0 ≤ green < yellow.
- The dialog prefills the last name typed on this device (`localStorage`, a per-device convenience).
- "Days ago" counts from the real local today, not the date switcher's day. Cleanings are stored
  with the local date (`formatDate`).
- **Permissions:** new permission `rooms` (admin + worker): create/edit/delete room cards, change
  unit statuses, mark cleaned. The master setup uses the existing `setup` (admin only) and lives
  on the admin-only Settings page. The `counter` (QR) role gets nothing.
- **History kept:** every cleaning (date, name) is stored; the card shows the latest, and an
  expander the last 10. Cleanings older than `HISTORY_DAYS` are pruned **except each room's
  latest**, so "45 days ago" still works. Unit statuses keep only the current one.

### Data model (added to `StockData`, so also to the backup)

```
rooms:          [{ id, number, type?, note? }]             // sorted by number (natural sort) on the page; note = the card's description
roomTypes:      [{ id, name }]                             // order = dropdown order
roomUnits:      [{ id, name }]                             // master layout, display order
roomStatuses:   [{ id, name, color }]                      // color: ROOM_COLORS[i]; [] = defaults
unitStatus:     { [roomId]: { [unitId]: { status, by, at, note? } } }   // missing = first status
cleanings:      { [roomId]: [{ date, by }] }               // newest first
settings:       { saluteText?, cleanGreenDays?, cleanYellowDays? }
```

## Steps

- [x] **1. Shared types, schemas and pure rules** (`shared/`)
  - Done. Differences: `unitStatusOf` returns `{ status, entry? }`; `removeStatusIn` drops the
    reset units' entries (missing = first) and returns false for the last/unknown status; added
    `latestCleaning`, `idOrderSchema` (shared by units/statuses/types order), `roomNameSchema`,
    `roomStatusPatchSchema`. `cleaningLevel` → `{ days: null, color: 'red' }` when never cleaned.
    `settingsPatchSchema` is now a refined object (only checks the pair when both are sent: step 3
    must check a single threshold against the stored other one, e.g. via `cleanThresholds`). The
    six new `StockData` keys are required and in `emptyStockData`, so the server's `/data` already
    returns them empty until step 2 stores them.
  - `types.ts`: the types above, `ROOM_COLORS` (`green, yellow, red` + 7: `blue, purple, orange,
teal, pink, brown, grey`), `DEFAULT_ROOM_STATUSES`, `DEFAULT_CLEAN_DAYS = { green: 15, yellow: 29 }`.
  - `auth.ts`: add `rooms` to `PERMISSIONS`, give it to `worker` (admin has all).
  - `schemas.ts`: request bodies (room create/patch with `note` trimmed, max `ROOM_NOTE_MAX` = 500;
    type/unit/status create/patch, order, unit
    status `{ status, by, note? }`, cleaning `{ date, by }`); `settingsPatchSchema` gets the two
    thresholds (refine green < yellow); `backupSchema` accepts the new keys as optional (old
    backups still load); `normalizeStockData` drops empty maps, blank notes, unknown ids.
  - New `rooms.ts` (+ test), exported from `index.ts`:
    `roomStatusList(data)` (never empty), `unitStatusOf(data, roomId, unitId)`,
    `cleaningLevel(lastDate | undefined, today, thresholds)` → `{ days, color }` (`never` → red),
    `cleanThresholds(settings)`, `sortRooms` (natural: 2 < 10 < 101), `removeUnitIn`,
    `removeStatusIn` (units → first status), `removeTypeIn`, `removeRoomIn`,
    `pruneCleanings(cleanings, keepFrom)` (keeps each room's latest).
  - Tests: every function, including threshold edges (15 → green, 16 → yellow, 29 → yellow,
    30 → red), never cleaned, pruning keeps the latest.

- [x] **2. SQLite storage** (skill `sqlite-db`)
  - Done. Differences: repos `db.rooms` (`create`/`update` → `Room | null | 'duplicate'`, null =
    unknown room or type; `delete`; `setUnitStatus` → `UnitStatus | null` for an unknown
    room/unit/status; `addCleaning` → the room's list or null), `db.roomUnits`/`db.roomTypes`
    (`OrderedRepo`: create/rename/delete/reorder), `db.roomStatuses` (create/update/reorder,
    `delete` → `true | false | 'last'`). Any status change stores the whole list (defaults
    included). `writeSetting` now stores 0 and numbers (read back as numbers); the pair check for a
    single threshold is still step 3's. `cleanings` has an index on (room_id, date).
  - Migration 5: tables `rooms (id, number UNIQUE, type_id, note)`, `room_types (id, name, pos)`,
    `room_units (id, name, pos)`, `room_statuses (id, name, color, pos)`,
    `unit_status (room_id, unit_id, status_id, by, at, note, PK(room_id, unit_id))`,
    `cleanings (room_id, date, by, at)`.
  - `rows.ts`: `snapshot`/`fill` the new keys; add the tables to `DATA_TABLES`.
  - New `db/sqlite/rooms.ts` with `createRooms(ctx)`; methods on `Db` (`db/types.ts`). Removing a
    unit/status/type/room applies the step 1 rule in the same transaction.
  - `prune`: run `pruneCleanings` (cheap `date <` check first, like stock).
  - Thresholds go through the existing `settings` key/value repo.
  - Tests in `server/tests/sqlite.test.ts`: round-trip a backup with rooms; old backup without
    them still restores; pruning keeps each room's latest cleaning.

- [x] **3. API routes** (skill `auth`)
  - Done. Differences: `POST /rooms` with an unknown type → 404. `PATCH /settings` with a single
    threshold reads the stored pair via `db.snapshot()` + `cleanThresholds` (400 unless green <
    yellow). Worker/counter 403 cases also added in `qr.test.ts` for the room-card routes.
  - New `server/src/routes/rooms.ts`, mounted at `'/'` in `app.ts`, so each route carries its own
    `allow(perm)` (a guard on a `'/'` mount would turn unknown routes into 403):
    - `allow('rooms')`: `POST /rooms`, `PATCH /rooms/:id` (number, type, note; `note: ''` clears it), `DELETE /rooms/:id`,
      `PUT /rooms/:id/units/:unitId` `{ status, by, note? }`, `POST /rooms/:id/cleanings` `{ date, by }`.
    - `allow('setup')`: `/room-units`, `/room-statuses`, `/room-types`, each `POST`,
      `PATCH /:id`, `DELETE /:id`, `PUT /order` `{ ids }`. Deleting the last status → 409.
  - Duplicate room number → 409; unknown ids → 404 via `found()`.
  - Thresholds: the existing `PATCH /settings`.
  - Tests: new `server/tests/rooms.test.ts` (own DB): the CRUD, a note is saved, trimmed and
    cleared by `''`, a 501-character note → 400, status reset on status delete; a worker
    (`login('0000')`) may create rooms, edit the note, change statuses and clean. In
    `tests/auth.test.ts`: a worker 403 case for every master route; a `counter` session 403 on all
    room routes (`tests/qr.test.ts` pattern).

- [x] **4. Client data layer** (skill `ui`)
  - Done. Differences: groups `roomMutations` (`addRoom`, `updateRoom`, `removeRoom`,
    `setUnitStatus`, `markCleaned(roomId, by)`: today's local date) and `roomSetupMutations`
    (`add/rename/remove/moveRoomUnit`, same for `RoomType`, `addRoomStatus(name, color)`,
    `updateRoomStatus(id, patch)` (rename and recolour), `removeRoomStatus` (does nothing for the
    last one), `moveRoomStatus`; moves take `(from, to)` and send the full id list). Unit status and
    cleaning write the server's answer back. `updateSettings` now also keeps the thresholds. Each
    colour also has a `-soft` token; `ROOM_COLOR_CLASSES[c]` gives `dot`/`text`/`soft`/`border`.
    A small `moved()` helper is shared with `moveTaskGroup`.
  - `context/stock/mutations.ts`: a `rooms` area (room CRUD, `setUnitStatus`, `markCleaned`) and
    the master setup mutations, each `edit(key, fn)` + one request, using the step 1 rules for the
    optimistic update. Cases in `mutations.test.ts`.
  - `styles/index.css`: tokens for the 10 status colours (`--status-green`… on `:root` and
    `[data-theme='dark']`), exposed as Tailwind colours (`bg-status-green`), plus a small map
    `client/src/lib/roomColors.ts` (colour id → classes).

- [ ] **5. The Rooms page** (skills `ui`, `i18n`)
  - `pages/Rooms.tsx` + `pages/rooms/`: `RoomCard` (number, type, the room note (`CommitTextarea`,
    placeholder "Add a note about this room"), unit rows with a status
    dropdown/chips, cleaning line + Cleaned, cleaning history expander, ✎ number/type, delete
    confirmed), `NewRoomForm` (number + type), `WhoDialog` (on `Modal`: name required, optional
    note when `withNote`, Cancel/Confirm, last name from `localStorage` in try/catch).
  - Route `/rooms` in `App.tsx`, `NAV` entry with `perm: 'rooms'` (icon `DoorOpen`), `nav.rooms`.
  - Cards in a responsive grid (1 column on phones). Empty states: no rooms; no units set up
    (admin sees a link to Settings).
  - All text in en/et/ru (`rooms.*`), with plurals for "N days ago" (`plural.ts`).
  - Tests `pages/Rooms.test.tsx` (extend `stockFixture`): create a card; edit the note → blur sends
    `PATCH /rooms/:id { note }`; change a status → dialog →
    Confirm sends `PUT`, Cancel sends nothing; Cleaned → "Cleaned today · Name"; colours follow
    thresholds; a worker sees the page but no Settings link.

- [ ] **6. Master setup in Settings** (skills `ui`, `i18n`)
  - `pages/settings/RoomSetupCard.tsx` (or split per list if it grows past ~200 lines):
    units (add / rename / remove confirmed / ↑↓ order), statuses (name + colour picker of the 10,
    main 3 first; remove confirmed), room types (add / rename / remove), the two thresholds
    (number inputs, invalid pair shows an error and isn't saved).
  - Reuse `AddForm`, `CommitInput`, `useConfirm`, `useDragSort` (or ↑/↓ buttons).
  - Tests in `pages/Settings.test.tsx`: add a unit, rename a status, change its colour, save
    thresholds, reject green ≥ yellow.

- [ ] **7. Close out**
  - `docs/structure.md`: file map, "Where to change X" if needed, data model, API routes, the
    `/rooms` page and the Settings section. README: one line about Rooms.
  - `ui`, `sqlite-db` skills: mention the new files where they list examples. `auth` skill: add
    the `rooms` row to the matrix table (admin ✓, worker ✓, counter —) and note that the `setup` row
    now also covers the room master setup.
  - Manual check with `npm run dev`: admin sets up units/statuses/types, worker logs in
    (PIN 0000), creates a card, writes its note, changes a status, marks cleaned; dark mode colours readable; phone width.

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `schemas.ts`, `mutations.ts`, `rows.ts` and `en.ts` are read in parts.
- Run single test files while working, the full suite once at the end (`| tail -30`).
- Steps 5 and 6 add UI text: follow the `i18n` skill (never read `et.ts`/`ru.ts` whole).
