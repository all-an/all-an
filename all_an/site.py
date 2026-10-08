"""The pages that are not about quizzes: the front page, about, the contact form, and the
administrator's settings."""

from flask import Blueprint, jsonify, redirect, render_template, request, send_from_directory, current_app

from . import messages, settings
from .auth.guards import admin_required
from .auth.sessions import current_user
from .errors import ApiError
from .security import client_ip
from .web import go

pages = Blueprint("site_pages", __name__)
api = Blueprint("site_api", __name__, url_prefix="/api")


@pages.get("/")
def front():
    return render_template("front.html")


@pages.get("/favicon.ico")
def favicon():
    # Browsers ask for this at the root whatever the page says.
    return send_from_directory(current_app.static_folder, "favicon.ico")


# Grouped rather than one flat badge wall: the grouping is the signal. A reader scanning for
# "does he know messaging?" finds the answer without reading thirty logos.
STACK = [
    ("Languages", ["Java", "Python", "Rust", "TypeScript", "JavaScript", "Bash"]),
    ("Backend", ["Spring Boot", "Quarkus", "Flask", "REST APIs"]),
    ("Frontend", ["Angular", "React", "HTMX"]),
    ("Data", ["PostgreSQL", "MySQL", "Flyway", "Liquibase"]),
    ("Messaging", ["RabbitMQ", "Apache Kafka"]),
    ("Infrastructure", ["AWS", "Docker", "Linux"]),
    ("Practices", ["TDD", "BDD", "DDD"]),
]


@pages.get("/about")
def about():
    return render_template("about.html", active="about", stack=STACK)


# --- the contact form --------------------------------------------------------------------------


@pages.get("/message")
def message_page():
    return render_template(
        "message.html", active="message", contact_email=messages.CONTACT_EMAIL, values={}, fields={}, error=""
    )


@pages.post("/message")
def message_submit():
    form = request.form
    values = {"name": form.get("name", ""), "email": form.get("email", ""), "body": form.get("body", "")}
    context = {"contact_email": messages.CONTACT_EMAIL, "values": values, "fields": {}, "error": ""}

    try:
        messages.send(client_ip(), values["name"], values["email"], values["body"])
    except ApiError as error:
        if error.status == 429:
            # The one "error" a normal person will hit, so it gets the warmest copy on the page.
            return render_template("partials/message_limited.html", **context), 429
        if error.status != 400:
            raise

        context["fields"] = error.details.get("fields", {})
        return render_template("partials/message_form.html", **context), 422

    return render_template("partials/message_sent.html", **context)


@api.post("/messages")
def api_message():
    body = request.get_json(silent=True)

    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")

    def text(key):
        value = body.get(key)
        return value if isinstance(value, str) else None

    return jsonify(messages.send(client_ip(), text("name"), text("email"), text("body"))), 201


# --- settings ----------------------------------------------------------------------------------


@api.get("/settings")
def read_settings():
    return jsonify(settings.read())


@api.put("/settings")
@admin_required
def write_settings():
    body = request.get_json(silent=True)

    if not isinstance(body, dict) or not isinstance(body.get("registrationEnabled"), bool):
        raise ApiError.bad_request_field(
            "That request was not valid.", "registrationEnabled", "registrationEnabled must be true or false"
        )

    return jsonify(settings.write({"registrationEnabled": body["registrationEnabled"]}, current_user()["id"]))


@pages.get("/admin")
@admin_required
def admin_page():
    return render_template("admin.html", active="admin", **settings.read(), notice="")


@pages.post("/admin/settings")
@admin_required
def admin_save():
    enabled = request.form.get("registrationEnabled") == "on"
    saved = settings.write({"registrationEnabled": enabled}, current_user()["id"])

    return render_template(
        "partials/admin_settings.html",
        registrationEnabled=saved["registrationEnabled"],
        notice="Saved. Anyone can create an account."
        if saved["registrationEnabled"]
        else "Saved. New accounts are closed.",
    )
