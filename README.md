# Fomka

A small tool for tracking daily housekeeping stock (linens, amenities, …) in a hotel. Consumption is partly derived from guest departures per room group, and stock can be counted per room on a phone. It is standalone (no integration with a hotel system) and protected by a 4-digit PIN: an **admin** PIN (sets up items, groups, rooms, checklist tasks, PINs, QR code, Restore) and a **worker** PIN (everything day-to-day). A QR code made by the admin opens today's room counting without a PIN.

| Layer   | Stack                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| Client  | React 19, Vite, Tailwind CSS 4, React Router, lucide icons, ExcelJS (lazy-loaded)            |
| Server  | Express 5, zod, helmet, pino, cookie sessions, express-rate-limit                            |
| Storage | SQLite (`data/stock.db`, better-sqlite3) behind a repository interface                       |
| Shared  | `@app/shared`: types, zod schemas, the stock rules                                           |
| Tooling | TypeScript, npm workspaces, Vitest, ESLint, Prettier, Docker                                 |

Structure and conventions come from the full-stack boilerplate (`boilerplate/`, reference only), without sockets, user accounts or the Postgres/MySQL drivers.

## Quick start

Requires Node ≥ 22.12.

```bash
npm install
npm run dev        # client http://localhost:5173 · API http://localhost:3000
```

On the first start the PINs are admin **1234** and worker **0000** (or `ADMIN_PIN`/`WORKER_PIN` from `.env`); change them under **Settings**. A browser stays logged in until **Logout**.

Pages: `/stock` (departures, consumption/income/stock per day, overview), `/counter` (all rooms) and `/counter/<roomId>` (one room's counting list; bookmark it per floor), `/checklist` (daily tasks and shift notes), `/settings` (admin: PINs and the counting QR code).

| Command             | What it does                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run dev`       | Server (tsx watch) + client (Vite) together                                |
| `npm run build`     | Bundle server (`server/dist`) and client (`client/dist`)                   |
| `npm start`         | Run the built server in production mode (also serves the client build)   |
| `npm test`          | Stock-rule tests, API tests, UI component tests                            |
| `npm run typecheck` | `tsc --noEmit` in every workspace                                          |
| `npm run lint`      | ESLint (`npm run format` for Prettier)                                     |

Optional settings are in `.env.example` (copy to `.env`).

## Docker

```bash
docker compose up --build -d     # http://localhost:3000 (APP_PORT=8080 to change)
```

The data lives in the `app-data` volume. Set `ADMIN_PIN`/`WORKER_PIN` in your shell or `.env` before the first start. To move existing data in, open the app as admin and use **Restore** with a backup file (or an old `data/db.json`).

## Data and backups

- `data/stock.db` (SQLite, `SQLITE_PATH`) holds everything. PINs and sessions are stored there too, but never in backups.
- An old `data/db.json` from before the switch is imported automatically on the first start and renamed `db.json.imported`.
- Before the first change of each day the server writes a JSON snapshot (backup format) to `data/backups/db-YYYY-MM-DD.json` (kept for `BACKUP_DAYS`, default 30).
- **Backup** in the header downloads the data as JSON. **Restore** (admin) replaces all data with a backup file (old-format backups work too). **Excel** downloads the full day-by-day history.

## Adding a feature

Same order as in the boilerplate:

1. Types and zod schemas in `shared/src/`.
2. A repository method in `server/src/db/types.ts`, implemented in `server/src/db/sqlite/index.ts` (see the `sqlite-db` skill).
3. A route in `server/src/routes/`, mounted in `server/src/app.ts`, guarded with `allow(perm)` (see the `auth` skill).
4. A page in `client/src/pages/`, a route in `client/src/App.tsx`, an entry in `NAV` (`client/src/components/layout/AppShell.tsx`).
5. All UI text in en/et/ru (the `i18n` skill), tests in `server/tests/`.

To switch storage later (e.g. Postgres), implement the `Db` interface in `server/src/db/<driver>/`, add a `case` in `db/index.ts` and extend `DB_DRIVER` in `config.ts`. Routes don't change.
