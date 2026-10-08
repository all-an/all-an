import shutil

import pytest

from all_an import db
from all_an.migrate import MIGRATIONS_DIR, MigrationError, load_migrations, migrate


def test_migration_files_are_found_in_order():
    versions = [m.version for m in load_migrations()]

    assert versions == sorted(versions)
    assert versions[0] == 1
    assert len(versions) == len(set(versions))


@pytest.mark.parametrize("pool", ["empty_database"], indirect=True)
def test_builds_the_schema_from_nothing_and_seeds_it(pool):
    applied = migrate(pool)

    assert applied == len(load_migrations())
    assert db.query_one("SELECT COUNT(*) AS n FROM study_fields")["n"] == 10
    assert db.query_one("SELECT COUNT(*) AS n FROM quizzes WHERE owner_id IS NULL")["n"] == 3
    assert db.query_one("SELECT value FROM app_settings WHERE key = 'registration_enabled'")[
        "value"
    ] == "true"


@pytest.mark.parametrize("pool", ["empty_database"], indirect=True)
def test_running_twice_applies_nothing_the_second_time(pool):
    migrate(pool)

    assert migrate(pool) == 0


@pytest.mark.parametrize("pool", ["empty_database"], indirect=True)
def test_refuses_to_start_when_an_applied_migration_has_changed(pool, tmp_path):
    copy = tmp_path / "migration"
    shutil.copytree(MIGRATIONS_DIR, copy)
    migrate(pool, copy)

    first = next(copy.glob("V1__*.sql"))
    first.write_text(first.read_text() + "\n-- edited after it was applied\n")

    with pytest.raises(MigrationError, match="has changed since it was applied"):
        migrate(pool, copy)


@pytest.mark.parametrize("pool", ["empty_database"], indirect=True)
def test_a_failing_migration_rolls_back_and_is_not_recorded(pool, tmp_path):
    copy = tmp_path / "migration"
    shutil.copytree(MIGRATIONS_DIR, copy)
    migrate(pool, copy)

    (copy / "V99__broken.sql").write_text("CREATE TABLE half_done (id int); SELECT nope();")

    with pytest.raises(MigrationError, match="V99__broken failed"):
        migrate(pool, copy)

    assert db.query_one("SELECT to_regclass('half_done') AS t")["t"] is None
    assert db.query_one("SELECT COUNT(*) AS n FROM schema_history WHERE version = 99")["n"] == 0


@pytest.mark.parametrize("pool", ["dev_database_copy"], indirect=True)
def test_accepts_a_database_migrated_by_the_node_and_rust_versions(pool):
    """The whole point of adopting the database: nothing is re-applied, nothing is refused."""
    assert migrate(pool) == 0


def test_ssl_rule():
    assert db.ssl_mode("postgresql://u:p@localhost:5432/d") == "disable"
    assert db.ssl_mode("postgresql://u:p@127.0.0.1/d") == "disable"
    assert db.ssl_mode("postgresql://u:p@dpg-abc123/d") == "disable"  # Render internal
    assert db.ssl_mode("postgresql://u:p@dpg-abc123.oregon-postgres.render.com/d") == "require"
