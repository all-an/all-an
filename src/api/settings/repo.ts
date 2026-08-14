import { query } from '../db/pool.js';

export interface SettingRow {
  key: string;
  value: string;
}

/**
 * Every setting, in one read.
 *
 * The table holds a handful of rows and the caller wants all of them, so there is no WHERE and no
 * index to miss - a sequential scan of five rows beats the round trip a per-key lookup would add.
 */
export async function findAllSettings(): Promise<SettingRow[]> {
  return query<SettingRow>('SELECT key, value FROM app_settings');
}

/**
 * Writes the given settings, creating any key the table does not have yet.
 *
 * One statement for the whole set rather than a loop, so a save is atomic without needing an
 * explicit transaction: the admin form posts every setting at once, and half of them landing would
 * leave the site in a state nobody asked for.
 *
 * The upsert matters beyond tidiness. A key added to the code after this database was seeded has no
 * row, and an UPDATE would silently affect nothing - the admin would toggle the switch, see it snap
 * back, and have no way to tell why.
 */
export async function upsertSettings(entries: SettingRow[], updatedBy: number): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     SELECT entry.key, entry.value, NOW(), $3
     FROM UNNEST($1::text[], $2::text[]) AS entry (key, value)
     ON CONFLICT (key) DO UPDATE
     SET value      = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by`,
    [entries.map((entry) => entry.key), entries.map((entry) => entry.value), updatedBy]
  );
}
