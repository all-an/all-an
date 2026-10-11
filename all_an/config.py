"""Everything the process reads from its environment, read once at startup."""

import os
from dataclasses import dataclass


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    return value if value else None


@dataclass(frozen=True)
class Config:
    database_url: str
    port: int = 8080
    # Behind Render's proxy the real client is in X-Forwarded-For. Only safe when a proxy of ours
    # sets that header itself - exposed directly to the internet, anyone could spoof their address
    # past the per-IP throttles. Off by default.
    trust_proxy_headers: bool = False
    session_cookie_secure: bool = False
    site_url: str = "http://localhost:8080"
    admin_username: str | None = None
    admin_email: str | None = None
    admin_password: str | None = None
    # Tests turn this off and call the migrator themselves.
    run_startup_tasks: bool = True

    @classmethod
    def from_env(cls) -> "Config":
        database_url = _env("DATABASE_URL")
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Locally: "
                "postgresql://allan:allan@localhost:5432/all-an-database"
            )

        port = int(_env("PORT") or 8080)

        return cls(
            database_url=database_url,
            port=port,
            trust_proxy_headers=os.environ.get("TRUST_PROXY_HEADERS") == "true",
            session_cookie_secure=os.environ.get("SESSION_COOKIE_SECURE") == "true",
            site_url=_env("SITE_URL") or f"http://localhost:{port}",
            admin_username=_env("ADMIN_USERNAME"),
            admin_email=_env("ADMIN_EMAIL"),
            admin_password=_env("ADMIN_PASSWORD"),
        )
