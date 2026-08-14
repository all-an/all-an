import { Forbidden } from '../http/errors.js';
import { findAllSettings, upsertSettings, type SettingRow } from './repo.js';

/**
 * The settings, typed. This interface and the KEYS map below are the only places that know a
 * key/value table is underneath - everything else reads booleans off an object.
 */
export interface Settings {
  /** Whether POST /api/auth/register is open. */
  registrationEnabled: boolean;
}

const KEYS = {
  registrationEnabled: 'registration_enabled'
} as const satisfies Record<keyof Settings, string>;

/**
 * What the site does when the table says nothing.
 *
 * Open, deliberately. A missing row means a key the code knows about and this database has not been
 * seeded with - a fresh deploy, or a row somebody removed by hand. Closing registration because a
 * row is absent would take the site down quietly and give no clue where to look; leaving it open
 * fails towards the behaviour the site had before settings existed.
 */
export const DEFAULT_SETTINGS: Settings = {
  registrationEnabled: true
};

/**
 * 'true' and 'false' are the only values written, but the column is TEXT and reachable with psql,
 * so anything else has to mean something. It means the default: refusing to start over a typo in a
 * settings row would be a worse outcome than ignoring it, and the warning says which key to fix.
 */
function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  console.warn(
    `Ignoring unreadable app_settings value ${JSON.stringify(value)}; using ${fallback}.`
  );

  return fallback;
}

/** Rows to the typed object. Pure, and the part worth testing. */
export function toSettings(rows: readonly SettingRow[]): Settings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    registrationEnabled: readBoolean(
      byKey.get(KEYS.registrationEnabled),
      DEFAULT_SETTINGS.registrationEnabled
    )
  };
}

/** The typed object back to rows. The inverse of toSettings, and what a save writes. */
export function toRows(settings: Settings): SettingRow[] {
  return [{ key: KEYS.registrationEnabled, value: String(settings.registrationEnabled) }];
}

/**
 * Read straight from the database, every time, with no cache in front.
 *
 * A cache here would need invalidating across however many instances Render is running, and the
 * thing it would save is one indexed read of a table with a handful of rows. The reason to keep it
 * uncached is not the cost, though: an administrator closing registration expects it closed now,
 * and a TTL means a window in which one instance still lets people through.
 */
export async function readSettings(): Promise<Settings> {
  return toSettings(await findAllSettings());
}

export async function writeSettings(settings: Settings, adminId: number): Promise<Settings> {
  await upsertSettings(toRows(settings), adminId);
  return settings;
}

/**
 * The enforcement point for the registration switch.
 *
 * 403 rather than 404 or 503: the endpoint exists and the request was well formed, the site is
 * simply refusing it. The message says so plainly, because someone who has just filled in a form
 * deserves better than a bare "forbidden" they will read as their own mistake.
 */
export async function assertRegistrationOpen(): Promise<void> {
  const { registrationEnabled } = await readSettings();

  if (!registrationEnabled) {
    throw new Forbidden('Registration is closed at the moment.');
  }
}
