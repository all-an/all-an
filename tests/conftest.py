"""Test fixtures. Each test that needs a database gets its own, created and dropped around it, so
tests cannot see each other's rows and never touch the dev data.

Point TEST_DATABASE_URL at any database on a server where the user may CREATE DATABASE; it is only
used to reach the server. Defaults to the local docker database from the README.
"""

import os
import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ADMIN_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://allan:allan@localhost:5432/postgres"
)
DEV_DATABASE = "all-an-database"


def url_for(database: str) -> str:
    return make_conninfo(ADMIN_URL, dbname=database)


def _admin():
    return psycopg.connect(ADMIN_URL, autocommit=True)


def _create(name: str, template: str | None = None) -> None:
    with _admin() as admin:
        statement = sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name))
        if template:
            statement += sql.SQL(" TEMPLATE {}").format(sql.Identifier(template))
        admin.execute(statement)


def _drop(name: str) -> None:
    with _admin() as admin:
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


@pytest.fixture
def empty_database():
    name = f"all_an_test_{uuid.uuid4().hex[:10]}"
    _create(name)
    try:
        yield url_for(name)
    finally:
        _drop(name)


@pytest.fixture
def dev_database_copy():
    """A copy of the real dev database, schema_history and all - the compatibility test."""
    with _admin() as admin:
        exists = admin.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (DEV_DATABASE,)
        ).fetchone()

    if not exists:
        pytest.skip(f"no {DEV_DATABASE!r} database to copy")

    name = f"all_an_copy_{uuid.uuid4().hex[:10]}"
    try:
        _create(name, template=DEV_DATABASE)
    except psycopg.errors.ObjectInUse:
        pytest.skip(f"{DEV_DATABASE!r} has open connections (stop the running app) - cannot copy")

    try:
        yield url_for(name)
    finally:
        _drop(name)


@pytest.fixture
def pool(request):
    """A pool on whichever database fixture the test asked for."""
    from all_an import db

    url = request.getfixturevalue(request.param)
    created = db.init_pool(url, max_size=2)
    try:
        yield created
    finally:
        db.close_pool()
