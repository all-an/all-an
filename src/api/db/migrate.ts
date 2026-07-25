import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getPool } from './pool.js';

/**
 * Arbitrary but fixed: any two processes asking for this same number contend for the same lock.
 * It only has to be unique among advisory locks this database uses, and this app uses exactly one.
 */
const MIGRATION_LOCK_ID = 4_120_724;

const FILE_PATTERN = /^V(\d+)__(.+)\.sql$/;

interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

/**
 * The SQL lives outside the bundle, so it has to be found on disk at runtime.
 *
 * Candidates in order of confidence: an explicit override, then the working directory (how Render
 * and `npm start` both run it), then a path relative to the built server file, which covers being
 * launched from somewhere else entirely.
 */
function migrationsDir(): string {
  const candidates = [
    process.env['MIGRATIONS_DIR'],
    join(process.cwd(), 'db', 'migration'),
    join(import.meta.dirname, '..', '..', '..', 'db', 'migration')
  ].filter((path): path is string => Boolean(path));

  const found = candidates.find((path) => existsSync(path));

  if (!found) {
    throw new Error(`No migrations directory found. Looked in: ${candidates.join(', ')}`);
  }

  return found;
}

async function loadMigrations(): Promise<Migration[]> {
  const dir = migrationsDir();
  const entries = await readdir(dir);

  const migrations = await Promise.all(
    entries
      .map((file) => ({ file, match: FILE_PATTERN.exec(file) }))
      .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
      .map(async ({ file, match }) => {
        const sql = await readFile(join(dir, file), 'utf8');

        return {
          version: Number(match[1]),
          name: match[2],
          sql,
          checksum: createHash('sha256').update(sql).digest('hex')
        };
      })
  );

  // Numeric sort, not lexicographic: V10 must come after V9, not between V1 and V2.
  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Applies every migration the database has not seen yet.
 *
 * Called before the server starts listening, so a request can never arrive against a half-migrated
 * schema. Safe to run from several instances at once: the advisory lock serialises them, and
 * whichever loses the race finds nothing left to do.
 */
export async function migrate(): Promise<void> {
  const migrations = await loadMigrations();
  const client = await getPool().connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_history (
        version     INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Blocks until any other instance mid-deploy has finished. Released in the finally below.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    try {
      const { rows: applied } = await client.query<{ version: number; checksum: string; name: string }>(
        'SELECT version, checksum, name FROM schema_history'
      );
      const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

      for (const migration of migrations) {
        const previous = appliedByVersion.get(migration.version);

        if (previous) {
          // An already-applied file that has since been edited means the database and the
          // repository disagree about what V<n> is, and every later assumption is now suspect.
          // Refuse to start rather than paper over it: the fix is a new migration, not an edit.
          if (previous.checksum !== migration.checksum) {
            throw new Error(
              `Migration V${migration.version} (${previous.name}) has changed since it was applied. ` +
                'Applied migrations are immutable - add a new one instead of editing this file.'
            );
          }

          continue;
        }

        // Each migration is its own transaction, so a failure half way through leaves the
        // preceding ones applied and this one entirely rolled back.
        await client.query('BEGIN');

        try {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_history (version, name, checksum) VALUES ($1, $2, $3)',
            [migration.version, migration.name, migration.checksum]
          );
          await client.query('COMMIT');
          console.log(`Applied V${migration.version}__${migration.name}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`Migration V${migration.version}__${migration.name} failed: ${error}`);
        }
      }

      const pending = migrations.length - appliedByVersion.size;
      console.log(
        pending > 0
          ? `Schema up to date (${migrations.length} migrations, ${pending} newly applied).`
          : `Schema up to date (${migrations.length} migrations, none pending).`
      );
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

let migrated: Promise<void> | undefined;

/**
 * Runs the migrations once per process, whoever asks first.
 *
 * Production awaits this before listening, so no request ever meets a half-migrated schema. Under
 * `ng serve` there is no such startup hook - the dev-server imports this module's server and never
 * runs its main block - so the API middleware awaits it too. Memoising the promise rather than a
 * boolean means concurrent first requests wait for the same run instead of racing into two.
 *
 * A failure clears the memo, so the next request retries rather than inheriting a poisoned
 * promise for the life of the process - the usual cause is a database that was not up yet.
 */
export function ensureMigrated(): Promise<void> {
  migrated ??= migrate().catch((error: unknown) => {
    migrated = undefined;
    throw error;
  });

  return migrated;
}
