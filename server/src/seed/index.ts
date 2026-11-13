import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { formatDate, todayLocal } from '@app/shared';
import { loadConfig } from '../config';
import { createDb, type Db } from '../db';
import { seedData } from './data';

/** True when the database holds anything a person entered (the default task group doesn't count). */
export function hasData(d: Awaited<ReturnType<Db['snapshot']>>): boolean {
  return (
    d.items.length > 0 ||
    d.groups.length > 0 ||
    d.locations.length > 0 ||
    d.tasks.length > 0 ||
    d.rooms.length > 0 ||
    d.roomUnits.length > 0 ||
    Object.keys(d.notes).length > 0
  );
}

/**
 * Fills `db` with the demo data. Refuses a database that already has data unless `force`;
 * with `force`, the old data is first saved as a JSON backup next to the database
 * (`backups/pre-seed-<time>.json`, restorable from the app's Restore). PINs and sessions are kept.
 */
export async function seed(
  db: Db,
  {
    force = false,
    today = formatDate(todayLocal()),
    backupDir,
  }: { force?: boolean; today?: string; backupDir?: string } = {},
): Promise<{ status: 'seeded' | 'refused'; backup?: string }> {
  const old = await db.snapshot();
  let backup: string | undefined;
  if (hasData(old)) {
    if (!force) return { status: 'refused' };
    if (backupDir) {
      mkdirSync(backupDir, { recursive: true });
      backup = join(backupDir, `pre-seed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeFileSync(backup, JSON.stringify(old, null, 2));
    }
  }
  await db.replace(seedData(today));
  return backup ? { status: 'seeded', backup } : { status: 'seeded' };
}

async function main() {
  const force = process.argv.includes('--force');
  const config = loadConfig();
  const db = await createDb(config);
  await db.init();
  try {
    const result = await seed(db, {
      force,
      backupDir: join(dirname(config.SQLITE_PATH), 'backups'),
    });
    if (result.status === 'refused') {
      console.error(
        `${config.SQLITE_PATH} already has data. Run \`npm run seed -- --force\` to replace it ` +
          '(the old data is saved to backups/ first), or point SQLITE_PATH at another file.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Seeded ${config.SQLITE_PATH}.${result.backup ? ` Old data saved to ${result.backup}.` : ''}`,
    );
    console.log('Reload the app (log in with your usual PINs) to see it.');
  } finally {
    await db.close();
  }
}

// Run only as a script (`npm run seed`), not when a test imports `seed`.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed/index.ts')) void main();
