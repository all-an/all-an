import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Render's internal hostnames resolve inside its private network, which is already isolated, and
 * they present no certificate a client could verify. Anything else - including Render's external
 * hostname, which ends in .render.com - is reached over the public internet and must use TLS.
 *
 * rejectUnauthorized is false for those because Render's Postgres serves a self-signed
 * certificate. That protects the traffic from passive eavesdropping but not from an active
 * man-in-the-middle, which is why the internal URL is the one to prefer in production.
 */
function sslConfig(url: string): { rejectUnauthorized: boolean } | false {
  const { hostname } = new URL(url);

  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  // Render's internal hostnames are single-label, e.g. "all-an-database".
  const isRenderInternal = !hostname.includes('.');

  return isLocal || isRenderInternal ? false : { rejectUnauthorized: false };
}

let instance: Pool | undefined;

/**
 * The connection pool, created on first use.
 *
 * Deliberately lazy. This module ends up in the Angular build graph by way of server.ts, and a
 * module that opens sockets or throws the moment it is imported would make `ng build` depend on a
 * reachable database. Nothing here happens until something actually wants to query.
 */
export function getPool(): Pool {
  if (instance) {
    return instance;
  }

  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Locally: postgresql://allan:allan@localhost:5432/all-an-database'
    );
  }

  instance = new Pool({
    connectionString,
    ssl: sslConfig(connectionString),
    // Render's free Postgres allows few connections and one web service can have several
    // instances. Ten is comfortable for a site this size and leaves room for the migration runner.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  // A pooled client can fail while idle - a database restart, a dropped network. Without a
  // listener the 'error' event is unhandled and takes the whole process down.
  instance.on('error', (error) => {
    console.error('Idle Postgres client errored', error);
  });

  return instance;
}

/** Runs a query and returns the rows, which is all any caller in this app wants. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

/** Runs a query expected to match at most one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Runs `fn` inside a transaction on a single client, rolling back if it throws.
 *
 * Needed wherever a write spans more than one statement - creating a quiz with its questions,
 * grading an answer and stamping the attempt - because those must not be observable half-applied.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
