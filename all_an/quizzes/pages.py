"""Browse and My quizzes.

Both pages are one server-rendered "body" region (filters + list). Clicking a filter chip swaps that
region in (and updates the address bar); the archive / publish / delete buttons post to the server
and swap in the region as it looks afterwards. Without JavaScript the chips are ordinary links and
the buttons ordinary forms, so nothing here depends on the script loading.
"""

from urllib.parse import quote, urlencode

from flask import Blueprint, redirect, render_template, request

from ..auth.guards import login_required
from ..auth.sessions import current_user
from . import service

pages = Blueprint("quizzes_pages", __name__)


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def _url(base: str, **params) -> str:
    query = urlencode({k: v for k, v in params.items() if v})
    return f"{base}?{query}" if query else base


def _chip(label: str, href: str, selected: bool, empty: bool = False) -> dict:
    return {"label": label, "href": href, "selected": selected, "empty": empty}


# --- browse ------------------------------------------------------------------------------------


def _browse_context(field: str | None, subject: str | None, archived: bool) -> dict:
    user = current_user()
    # Only somebody signed in has an archive to look at.
    archived = archived and user is not None

    def url(f, s, a):
        base = f"/quizzes/browse/{quote(f, safe='')}" if f else "/quizzes/browse"
        return _url(base, subject=s, archived="1" if a else None)

    items = service.list_public(user, field, subject, 50, 0, archived)
    fields = service.list_study_fields()
    subjects = service.list_subjects(user, False, field)

    return {
        "archived": archived,
        "field": field,
        "subject": subject,
        "items": items,
        "view_chips": [
            _chip("All quizzes", url(field, subject, False), not archived),
            _chip("Archived", url(field, subject, True), archived),
        ],
        "field_chips": [
            # Picking the selected field again clears it. The subject is dropped either way: it
            # belonged to the field you are leaving.
            _chip(
                f"{f['name']} ({f['publicQuizCount']})",
                url(None if f["slug"] == field else f["slug"], None, archived),
                f["slug"] == field,
                f["publicQuizCount"] == 0,
            )
            for f in fields
        ],
        "subject_chips": [
            _chip(name, url(field, None if name == subject else name, archived), name == subject)
            for name in subjects
        ],
    }


@pages.get("/quizzes/browse")
@pages.get("/quizzes/browse/<slug>")
def browse(slug=None):
    context = _browse_context(slug, _clean(request.args.get("subject")), request.args.get("archived") == "1")
    return render_template("browse.html", active="browse", **context)


@pages.post("/quizzes/browse/<action>/<int:quiz_id>")
@login_required
def browse_action(action, quiz_id):
    """Archive / unarchive from the browse list; answers with the list as it now looks."""
    if action in ("archive", "unarchive"):
        service.set_archived(quiz_id, current_user(), action == "archive")

    form = request.form
    context = _browse_context(
        _clean(form.get("field")), _clean(form.get("subject")), form.get("archived") == "1"
    )
    return render_template("partials/browse_body.html", **context)


# --- my quizzes --------------------------------------------------------------------------------


def _mine_context(field: str | None, subject: str | None, archived: bool) -> dict:
    user = current_user()

    def url(f, s, a):
        return _url("/quizzes", field=f, subject=s, archived="1" if a else None)

    items = service.list_own(user, field, subject, archived)

    return {
        "archived": archived,
        "field": field,
        "subject": subject,
        "items": items,
        "view_chips": [
            _chip("Active", url(field, subject, False), not archived),
            _chip("Archived", url(field, subject, True), archived),
        ],
        "field_chips": [
            _chip(f["name"], url(None if f["slug"] == field else f["slug"], subject, archived), f["slug"] == field)
            for f in service.list_study_fields()
        ],
        "subject_chips": [
            _chip(name, url(field, None if name == subject else name, archived), name == subject)
            for name in service.list_subjects(user, True)
        ],
    }


@pages.get("/quizzes")
@login_required
def my_quizzes():
    context = _mine_context(
        _clean(request.args.get("field")), _clean(request.args.get("subject")), request.args.get("archived") == "1"
    )
    return render_template("my_quizzes.html", active="quizzes", **context)


@pages.post("/quizzes/<int:quiz_id>/<action>")
@login_required
def quiz_action(quiz_id, action):
    """The buttons on a My quizzes card. Each answers with the list as it now looks, so a quiz that
    has just moved to the other view, or been deleted, is gone and the empty state shows if it was
    the last."""
    user = current_user()

    match action:
        case "archive" | "unarchive":
            service.set_archived(quiz_id, user, action == "archive")
        case "publish" | "unpublish":
            service.set_visibility(quiz_id, user, "PUBLIC" if action == "publish" else "PRIVATE")
        case "delete":
            service.remove_quiz(quiz_id, user)
        case _:
            return redirect("/quizzes", 303)

    form = request.form
    context = _mine_context(
        _clean(form.get("field")), _clean(form.get("subject")), form.get("archived") == "1"
    )

    if request.headers.get("HX-Request"):
        return render_template("partials/my_quizzes_body.html", **context)

    return redirect(_url("/quizzes", field=context["field"], subject=context["subject"], archived="1" if context["archived"] else None), 303)
