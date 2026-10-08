"""The connection pool and the few helpers every module uses to talk to Postgres.

Plain SQL, no ORM: the schema is fixed and the queries already exist in the Rust version, so an
ORM would only re-describe tables that are not going to change.
"""

from contextlib import contextmanager
from urllib.parse import urlparse

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def ssl_mode(database_url: str) -> str:
    """`localhost` and single-label hostnames (Render's private network) speak plain TCP.

    Anything else is a public endpoint and gets TLS - required, but not certificate-verified,
    because managed Postgres hosts commonly present certificates that do not chain to a public CA.
    """
    host = urlparse(database_url).hostname or ""
    is_local = host in ("localhost", "127.0.0.1", "::1") or host.startswith("/")
    is_internal = "." not in host

    return "disable" if is_local or is_internal else "require"


def init_pool(database_url: str, max_size: int = 5) -> ConnectionPool:
    """Opens the pool. `max_size` is per worker process, so size it as the database's limit
    divided by the number of gunicorn workers."""
    global _pool

    if _pool is not None:
        _pool.close()

    _pool = ConnectionPool(
        database_url,
        min_size=1,
        max_size=max_size,
        timeout=10,
        max_idle=30,
        # Managed Postgres closes connections that sit idle; a connection that has gone stale is
        # replaced here rather than failing the request that happened to be handed it.
        check=ConnectionPool.check_connection,
        kwargs={"sslmode": ssl_mode(database_url), "row_factory": dict_row},
        open=True,
    )
    _pool.wait()
    return _pool


def pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("The database pool has not been initialised.")
    return _pool


def close_pool() -> None:
    global _pool

    if _pool is not None:
        _pool.close()
        _pool = None


def query(sql: str, params: tuple | list | dict | None = None) -> list[dict]:
    """Every row as a dict."""
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list | dict | None = None) -> dict | None:
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchone()


def execute(sql: str, params: tuple | list | dict | None = None) -> int:
    """Runs a statement and returns how many rows it touched."""
    with pool().connection() as conn:
        return conn.execute(sql, params).rowcount


@contextmanager
def transaction():
    """One connection, committed on success and rolled back on any exception."""
    with pool().connection() as conn:
        with conn.transaction():
            yield conn
