/**
 * Append-only list. Never edit an applied migration — add a new one with the next id.
 *
 * No foreign keys: restoring a backup must accept rows that point at removed things (counts of a
 * removed room, ticks of an old task), so the repos delete dependent rows themselves.
 * `pos` is the display order of a list (0, 1, 2…).
 */
export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
      CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, pos INTEGER NOT NULL);
      CREATE TABLE multipliers (
        item_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        qty REAL NOT NULL,
        PRIMARY KEY (item_id, group_id)
      );
      CREATE TABLE records (
        item_id TEXT NOT NULL,
        date TEXT NOT NULL,
        c REAL, i REAL, m REAL, mc REAL,
        PRIMARY KEY (item_id, date)
      );

      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, pos INTEGER NOT NULL);
      CREATE TABLE departures (
        group_id TEXT NOT NULL,
        date TEXT NOT NULL,
        d REAL NOT NULL,
        PRIMARY KEY (group_id, date)
      );

      CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, pos INTEGER NOT NULL);
      CREATE TABLE counts (
        date TEXT NOT NULL,
        location_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (date, location_id, item_id)
      );
      CREATE INDEX idx_counts_item ON counts(item_id);

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        added TEXT,
        removed TEXT,
        earlier_json TEXT,
        pos INTEGER NOT NULL
      );
      CREATE TABLE checks (
        date TEXT NOT NULL,
        task_id TEXT NOT NULL,
        at TEXT NOT NULL,
        PRIMARY KEY (date, task_id)
      );
      CREATE TABLE notes (date TEXT PRIMARY KEY, text TEXT NOT NULL);

      CREATE TABLE pins (role TEXT PRIMARY KEY, hash TEXT NOT NULL);
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        link_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE qr_links (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    `,
  },
];
