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


# --- the app -----------------------------------------------------------------------------------


class Browser:
    """A Flask test client that behaves like a browser with respect to CSRF: it keeps cookies and
    echoes the csrf cookie back in the header on anything that is not a GET."""

    def __init__(self, app, remote_addr: str = "10.0.0.1"):
        self.client = app.test_client()
        self.remote_addr = remote_addr

    def _csrf(self) -> str:
        cookie = self.client.get_cookie("csrf")
        if cookie is None:
            self.client.get("/healthz")
            cookie = self.client.get_cookie("csrf")
        return cookie.value

    def request(self, method: str, url: str, *, csrf: bool = True, **kwargs):
        headers = dict(kwargs.pop("headers", {}))
        if method not in ("GET", "HEAD") and csrf:
            headers.setdefault("X-CSRF-Token", self._csrf())
        kwargs.setdefault("environ_overrides", {"REMOTE_ADDR": self.remote_addr})
        return self.client.open(url, method=method, headers=headers, **kwargs)

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def put(self, url, **kw):
        return self.request("PUT", url, **kw)

    def patch(self, url, **kw):
        return self.request("PATCH", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)


@pytest.fixture
def app(empty_database):
    from all_an import create_app, db
    from all_an.config import Config
    from all_an.migrate import migrate

    config = Config(
        database_url=empty_database,
        run_startup_tasks=False,
        site_url="http://localhost",
    )
    created = create_app(config)
    migrate(db.pool())
    created.config["TESTING"] = True
    created.config["PROPAGATE_EXCEPTIONS"] = False

    try:
        yield created
    finally:
        db.close_pool()


@pytest.fixture
def browser(app):
    return Browser(app)


@pytest.fixture
def make_browser(app):
    return lambda ip="10.0.0.1": Browser(app, ip)


@pytest.fixture
def make_user(app):
    """Inserts a user directly (registration may be closed, or throttled) and returns its row."""
    from all_an import users
    from all_an.auth.passwords import hash_password

    def make(username="alice", password="a long enough phrase", role="USER", email=None):
        row = users.insert(username, email or f"{username}@example.com", hash_password(password), role)
        row["password"] = password
        return row

    return make


def sign_in(browser, username="alice", password="a long enough phrase"):
    response = browser.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.get_data(as_text=True)
    return response
