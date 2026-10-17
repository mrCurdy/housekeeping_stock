# Stock Monitor

A small tool for tracking daily housekeeping stock (linens, amenities, …) in a hotel. Consumption is partly derived from guest departures per room group, and stock can be counted per room on a phone. It is standalone: there is no integration with a hotel system and no login.

| Layer   | Stack                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| Client  | React 19, Vite, Tailwind CSS 4, React Router, lucide icons, ExcelJS (lazy-loaded)            |
| Server  | Express 5, zod, helmet, pino                                                                 |
| Storage | JSON file (`data/db.json`) behind a repository interface, so a SQL driver can be added later |
| Shared  | `@app/shared`: types, zod schemas, the stock rules                                           |
| Tooling | TypeScript, npm workspaces, Vitest, ESLint, Prettier, Docker                                 |

Structure and conventions come from the full-stack boilerplate (`boilerplate/`, reference only), without auth, sockets or SQL drivers.

## Quick start

Requires Node ≥ 22.12.

```bash
npm install
npm run dev        # client http://localhost:5173 · API http://localhost:3000
```

Pages: `/stock` (departures, consumption/income/stock per day, overview), `/counter` (all rooms) and `/counter/<roomId>` (one room's counting list; bookmark it per floor).

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

The data lives in the `app-data` volume. To move existing data in, open the app and use **Restore** with a backup file (or `data/db.json`).

## Data and backups

- `data/db.json` holds everything, in the same format as a backup file.
- Before the first change of each day the server copies it to `data/backups/db-YYYY-MM-DD.json` (kept for `BACKUP_DAYS`, default 30).
- **Backup** in the header downloads the data as JSON. **Restore** replaces all data with a backup file (old-format backups work too). **Excel** downloads the full day-by-day history.

## Adding a feature

Same order as in the boilerplate:

1. Types and zod schemas in `shared/src/`.
2. A repository method in `server/src/db/types.ts`, implemented in `server/src/db/json/index.ts`.
3. A route in `server/src/routes/`, mounted in `server/src/app.ts`.
4. A page in `client/src/pages/`, a route in `client/src/App.tsx`, an entry in `NAV` (`client/src/components/layout/AppShell.tsx`).
5. Tests in `server/tests/api.test.ts`.

To switch storage later (e.g. SQLite), implement the `Db` interface in `server/src/db/<driver>/`, add a `case` in `db/index.ts` and extend `DB_DRIVER` in `config.ts`. Routes don't change.
