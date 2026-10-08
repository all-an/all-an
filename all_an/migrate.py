"""Applies db/migration/V<n>__<name>.sql, the Flyway-style files the schema already lives in.

Compatible with the Node and Rust versions: the same `schema_history` table, the same SHA-256
checksum of the file text, the same advisory lock. A database migrated by any of them is picked up
as it is, with nothing re-applied.
"""

import hashlib
import logging
import re
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migration"

# Arbitrary, but fixed: every instance asks Postgres for the same advisory lock, so two starting at
# once migrate one after the other instead of racing.
MIGRATION_LOCK_ID = 4_120_724

_FILE_PATTERN = re.compile(r"^V(\d+)__(.+)\.sql$")


class MigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str
    checksum: str


def load_migrations(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    migrations = []

    for path in directory.iterdir():
        match = _FILE_PATTERN.match(path.name)
        if not match:
            continue

        # newline="" keeps the bytes as written; the checksum must match what the other versions
        # computed over the file text, so no newline translation.
        with path.open(encoding="utf-8", newline="") as handle:
            sql = handle.read()

        migrations.append(
            Migration(
                version=int(match.group(1)),
                name=match.group(2),
                sql=sql,
                checksum=hashlib.sha256(sql.encode("utf-8")).hexdigest(),
            )
        )

    return sorted(migrations, key=lambda m: m.version)


def migrate(pool, directory: Path = MIGRATIONS_DIR) -> int:
    """Applies whatever is pending, each file in its own transaction. Returns how many were applied.

    An applied migration whose file has since changed is an error: applied migrations are
    immutable, so editing one in place is a mistake to be caught here rather than a silent
    divergence between environments.
    """
    migrations = load_migrations(directory)

    # One connection throughout: an advisory lock belongs to a session, not to a pool.
    with pool.connection() as conn:
        conn.autocommit = True

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_history (
              version     INTEGER PRIMARY KEY,
              name        TEXT NOT NULL,
              checksum    TEXT NOT NULL,
              applied_at  TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
            """
        )

        conn.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))

        try:
            applied = {
                row["version"]: row
                for row in conn.execute("SELECT version, checksum, name FROM schema_history")
            }
            newly_applied = 0

            for migration in migrations:
                previous = applied.get(migration.version)

                if previous:
                    if previous["checksum"] != migration.checksum:
                        raise MigrationError(
                            f"Migration V{migration.version} ({previous['name']}) has changed "
                            "since it was applied. Applied migrations are immutable - add a new "
                            "one instead of editing this file."
                        )
                    continue

                try:
                    with conn.transaction():
                        # No parameters, so psycopg uses the simple query protocol, which allows
                        # a file to hold many statements.
                        conn.execute(migration.sql)
                        conn.execute(
                            "INSERT INTO schema_history (version, name, checksum) "
                            "VALUES (%s, %s, %s)",
                            (migration.version, migration.name, migration.checksum),
                        )
                except Exception as error:
                    raise MigrationError(
                        f"Migration V{migration.version}__{migration.name} failed: {error}"
                    ) from error

                newly_applied += 1
                log.info("Applied V%s__%s", migration.version, migration.name)

            log.info(
                "Schema up to date (%d migrations, %d newly applied).",
                len(migrations),
                newly_applied,
            )
            return newly_applied
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))
