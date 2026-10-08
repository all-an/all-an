"""Browser tests: a real server on a real port, driven by headless Chromium.

These cover what the Flask test client cannot - that the HTMX attributes in the templates do what
the server-side tests assume they do. Skipped when Playwright's browser is not installed
(`playwright install chromium`).
"""

import threading

import pytest
from werkzeug.serving import make_server

playwright_sync = pytest.importorskip("playwright.sync_api")


@pytest.fixture(scope="session")
def browser_engine():
    with playwright_sync.sync_playwright() as p:
        try:
            engine = p.chromium.launch()
        except Exception as error:  # the browser binary is not installed
            pytest.skip(f"Chromium is not available: {error}")
        yield engine
        engine.close()


@pytest.fixture
def server(app):
    """The app, served for real. Same database as the `app` fixture, so tests can seed it."""
    http = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()

    try:
        yield f"http://127.0.0.1:{http.server_port}"
    finally:
        http.shutdown()
        thread.join(timeout=5)


@pytest.fixture
def page(browser_engine, server):
    context = browser_engine.new_context()
    page = context.new_page()
    page.set_default_timeout(8000)
    page.base_url = server
    page.on("dialog", lambda dialog: dialog.accept())  # hx-confirm uses window.confirm

    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.js_errors = errors

    try:
        yield page
    finally:
        context.close()
