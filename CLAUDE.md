# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Fomka" (formerly "Stock Monitor") is a standalone tool for tracking a hotel's daily housekeeping stock (linens, amenities, etc.) per item. Part of the consumption comes from guest-group departures.

- It isn't connected to any hotel system.
- Login is a light 4-digit PIN: one PIN for the admin, one for the worker, plus a QR link that opens today's Counter.
- Everything is stored in one SQLite file.

The user wants it simple and lightweight but easy to extend.

## Commands

```bash
npm install
npm run dev                  # server :3000 (tsx watch) + client :5173 (Vite, proxies /api). Develop with this
npm test                     # shared (stock rules) + server (API) + client (UI) tests, all Vitest
npm run typecheck && npm run lint
npx vitest run -t "room"     # a single test, run inside a workspace (shared/, server/ or client/)
npm run build && npm start   # production (start sets NODE_ENV=production): the server also serves client/dist
docker compose up --build -d # http://localhost:3000, data in the app-data volume
```

Before committing: `npm run lint && npm run typecheck && npm test`.

If the app behaves unlike the code (e.g. the server ignores a new field), check what is serving :3000 before debugging: `curl -s localhost:3000/api/health`. `builtAt` older than the change (or `npm start` running `dist/`) means a stale build. Restart it or use `npm run dev`. From source it shows `commit: "source"`.

## Where to look

- **`docs/structure.md`** has the file map and a "Where to change X" table. It also holds the data model, the stock calculation, the per-page behaviour and the known weak spots. Read it instead of exploring the tree.
- Skills:
  - **`ui`**: any client work (pages, components, a new data change through `StockContext`, styling, phones, client tests).
  - **`i18n`**: any visible text.
  - **`sqlite-db`**: storage, migrations, repo methods.
  - **`auth`**: routes, guards, roles, PINs, QR.
  - **`plan-step`**: doing one step of a `docs/plan-*.md`.

## Architecture

npm workspaces, structured like `boilerplate/`. That's an untracked checkout of a full-stack TypeScript template, kept for reference only: don't modify it unless asked (the real one is `~/Projects/boilerplate`). Socket.io, the Postgres/MySQL drivers, user accounts and the appearance customizer were left out on purpose. Auth is a small PIN/role layer of its own.

- **`shared/src/`** (`@app/shared`, imported as TS source by both sides):
  - types and zod schemas (`StockData` is also the backup format);
  - the role matrix `can(role, perm)`;
  - the pure rules: `createStockMath` (stock) and the `checklist.ts` task history, used by both the server and the client's optimistic updates.
- **`server/src/`** (Express 5):
  - `config.ts` validates the env with zod.
  - Routes use only the `Db` interface (`db/types.ts`). Its one driver is `db/sqlite/`: every change runs in one transaction, and a daily JSON snapshot goes to `backups/`.
  - `auth/` has the PIN hashes, the session cookie and the `allow(perm)` guard. Every `/api` route except `health`, `auth/login` and `auth/link` needs a session.
  - A missing row → `HttpError.notFound` via `found()`.
- **`client/src/`** (React, Vite, Tailwind 4, React Router):
  - `AuthContext` shows the PIN screen until there is a session.
  - `StockContext` holds the dataset and every mutation. A change shows on screen at once, sends one small request, and on failure shows a toast and reloads. It also polls every 15 s.
  - `DateContext` holds the selected day. `I18nContext` serves en/et/ru.
  - Pages are lazy routes in `App.tsx`, listed in `NAV` in `AppShell.tsx`. The UI kit is `components/ui/`.

## Rules

- Dates are local `YYYY-MM-DD` strings (`formatDate`), never ISO/UTC.
- Stock totals are never stored: they always come from `createStockMath`.
- Stored data contains only real values: no nulls, no empty records, no 0 departures (`normalizeStockData`).
- Never hard-code UI text. Use `t` from `useI18n()` and add it in all three languages.
- Use semantic colour tokens (`bg-surface`, `text-fg-muted`, `text-primary`…), never raw colours, so dark mode keeps working.
- Each new route needs `allow(perm)` on the server. Hiding a control in the UI is not enough.
- When a change adds a file, a page or a rule, update `docs/structure.md` (and the skill involved) in the same commit.
