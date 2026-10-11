import logging

from dotenv import load_dotenv
from flask import Flask, jsonify

from . import db
from .config import Config
from .errors import register_error_handlers
from .security import init_security
from .migrate import migrate


def create_app(config: Config | None = None) -> Flask:
    # A missing .env is normal (production sets real variables).
    load_dotenv()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    config = config or Config.from_env()

    app = Flask(__name__)
    app.config["ALL_AN"] = config

    pool = db.init_pool(config.database_url)

    if config.run_startup_tasks:
        # Migrate before serving, never alongside: a request that arrives against a half-migrated
        # schema fails in ways that look like application bugs. A failure here stops the worker
        # booting, so the health check never passes and Render keeps the previous deploy serving.
        # Every gunicorn worker runs this; the advisory lock makes the second a no-op.
        migrate(pool)

    register_error_handlers(app)
    init_security(app)

    from . import users
    from .auth import routes as auth_routes
    from .auth.sessions import current_user, sweep_expired

    app.register_blueprint(auth_routes.pages)
    app.register_blueprint(auth_routes.api)

    from .quizzes import api as quizzes_api, pages as quizzes_pages

    app.register_blueprint(quizzes_api.api)
    app.register_blueprint(quizzes_pages.pages)

    from .quizzes import editor as quizzes_editor

    app.register_blueprint(quizzes_editor.editor)

    from .attempts import api as attempts_api, pages as attempts_pages

    app.register_blueprint(attempts_api.api)
    app.register_blueprint(attempts_pages.pages)

    from . import site, timesheet_export, timesheet_web

    for blueprint in (site.api, site.pages, timesheet_web.pages, timesheet_export.pages):
        app.register_blueprint(blueprint)

    if config.run_startup_tasks:
        users.bootstrap_admin(config)
        sweep_expired()

    @app.context_processor
    def inject_user():
        return {"user": current_user()}

    @app.get("/healthz")
    def healthz():
        """Render polls this to decide whether a deploy is live.

        It checks the database rather than just returning 200: an instance that cannot reach
        Postgres can serve nothing that matters, and reporting it healthy would let a broken
        deploy replace a working one.
        """
        try:
            db.query_one("SELECT 1 AS ok")
        except Exception:
            app.logger.exception("Health check failed")
            return jsonify(status="unavailable"), 503

        return jsonify(status="ok")

    return app
