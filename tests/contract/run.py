"""Contract check: replay one scripted conversation against an app and print a normalised transcript.

    python tests/contract/run.py http://localhost:4200 > rust.json
    python tests/contract/run.py http://localhost:4300 > flask.json
    diff rust.json flask.json

Both apps share one database, so the script creates its own users, runs, and cleans up after itself
(see `--prepare` / `--cleanup`). Ids, timestamps and clock readings differ between runs by nature;
they are replaced with placeholders so the diff shows only real differences.
"""

import json
import re
import subprocess
import sys

import requests

DB = ["docker", "exec", "all-an-db", "psql", "-U", "allan", "-d", "all-an-database", "-q", "-t", "-A", "-c"]
# Written by Node's crypto.scrypt for "pässword with spaces".
HASH = (
    "scrypt$16384$8$1$rYXvIGxI4ayfib2N3Z4Reg$"
    "bhoK-b9VKngSZtxlbKczGi-DFes0LxQ-FbEm9WgcI5PfQvLYx_xxXrweI-TRdFchSPpekmNPxDV0v5TWAlutHA"
)
PASSWORD = "pässword with spaces"
USERS = ["ct_alice", "ct_bob", "ct_root"]


def sql(statement):
    subprocess.run([*DB, statement], check=True, capture_output=True)


def prepare():
    cleanup()
    sql(
        "INSERT INTO users (username, email, password_hash, role) VALUES "
        f"('ct_alice','ct_alice@example.com','{HASH}','USER'),"
        f"('ct_bob','ct_bob@example.com','{HASH}','USER'),"
        f"('ct_root','ct_root@example.com','{HASH}','ADMIN')"
    )


def cleanup():
    names = ",".join(f"'{u}'" for u in USERS)
    sql(f"DELETE FROM auth_events WHERE ip = '127.0.0.1' OR username IN ({names})")
    sql(f"DELETE FROM messages WHERE ip = '127.0.0.1'")
    sql(f"DELETE FROM users WHERE username IN ({names})")
    sql("UPDATE app_settings SET value = 'true' WHERE key = 'registration_enabled'")


class Client:
    def __init__(self, base, transcript, who):
        self.base, self.transcript, self.who = base, transcript, who
        self.http = requests.Session()
        # A browser has loaded a page, and so holds the CSRF cookie, before it posts anything.
        self.http.get(base + "/healthz")

    def call(self, method, path, body=None, note=""):
        headers = {}
        if csrf := self.http.cookies.get("csrf"):
            headers["X-CSRF-Token"] = csrf  # the Rust app ignores it; the Flask app requires it

        response = self.http.request(method, self.base + path, json=body, headers=headers, allow_redirects=False)

        try:
            payload = response.json() if response.content else None
        except ValueError:
            payload = f"<non-json {response.headers.get('content-type')}>"

        self.transcript.append(
            {
                "who": self.who,
                "step": f"{method} {path}" + (f"  # {note}" if note else ""),
                "status": response.status_code,
                "body": payload,
                "set_cookie": sorted(
                    {part.split("=")[0] for h in response.raw.headers.getlist("Set-Cookie") for part in [h] if "sid=" in h}
                ),
            }
        )
        return payload


ID_KEYS = re.compile(r"(^id$|Id$|^quizId$|^attemptId$)")
TIME_KEYS = {"createdAt", "startedAt", "finishedAt", "sharedAt", "requestedAt", "since"}


def normalise(transcript):
    def placeholder(value):
        # Ids come from per-table sequences that differ between runs, and the same integer can be a
        # quiz in one run and an option in the next, so no attempt is made to keep them related.
        return "<id>"

    def walk(node, key=""):
        if isinstance(node, dict):
            out = {k: walk(v, k) for k, v in node.items()}
            if isinstance(out.get("options"), list) and all(isinstance(o, dict) for o in out["options"]):
                # Choices are shuffled per request; order is not part of the contract.
                out["options"] = sorted(out["options"], key=lambda o: str(o.get("body")))
            return out
        if isinstance(node, list):
            return [walk(v, key) for v in node]
        if isinstance(node, int) and not isinstance(node, bool) and ID_KEYS.search(key):
            return placeholder(node)
        if key in TIME_KEYS and isinstance(node, str):
            return "<time>"
        if key in ("remainingMs", "elapsedMs") and isinstance(node, int):
            return "<ms>"
        if key == "retryAfterSeconds" and isinstance(node, int):
            return "<seconds>"
        return node

    def step_label(label):
        # "/api/quizzes/9/questions" -> "/api/quizzes/<id1>/questions"
        return re.sub(r"/(\d+)(?=/|$| )", lambda m: "/" + placeholder(int(m.group(1))), label)

    out = []
    for step in transcript:
        # Responses first: they are where an id is first seen, so numbering follows the data.
        normalised = walk(step)
        normalised["step"] = step_label(step["step"])
        out.append(normalised)

    return out


def scenario(base):
    t = []
    alice, bob, root, visitor = (Client(base, t, n) for n in ("alice", "bob", "root", "visitor"))

    visitor.call("GET", "/healthz")
    visitor.call("GET", "/api/auth/me", note="signed out")
    visitor.call("GET", "/api/nope")
    visitor.call("GET", "/api/quizzes/abc")
    visitor.call("GET", "/api/settings")
    visitor.call("GET", "/api/quizzes/study-fields")
    visitor.call("POST", "/api/auth/login", {"username": "a", "password": "x"}, "invalid")
    visitor.call("POST", "/api/auth/register", {"username": "a", "email": "x", "password": "short"}, "invalid")

    alice.call("POST", "/api/auth/login", {"username": "ct_alice", "password": "wrong password!"}, "wrong")
    alice.call("POST", "/api/auth/login", {"username": "nobody_here", "password": "wrong password!"}, "unknown user")
    alice.call("POST", "/api/auth/login", {"username": "CT_ALICE", "password": PASSWORD}, "case-insensitive")
    alice.call("GET", "/api/auth/me")
    for who in (bob, root):
        who.call("POST", "/api/auth/login", {"username": "ct_" + who.who, "password": PASSWORD})

    # --- quizzes -------------------------------------------------------------------------
    alice.call("POST", "/api/quizzes", {"title": " ", "subject": "", "defaultTimeLimitSeconds": 2}, "invalid")
    alice.call("POST", "/api/quizzes", {"title": "T", "studyFieldId": 999, "subject": "S"}, "no such field")
    quiz = alice.call(
        "POST", "/api/quizzes",
        {"title": "Contract <b>quiz</b>", "studyFieldId": 4, "subject": "Rust", "description": " d ", "defaultTimeLimitSeconds": 45},
    )
    qid = quiz["id"]
    alice.call("PUT", f"/api/quizzes/{qid}", {"title": "Contract quiz", "studyFieldId": 4, "subject": "Rust"}, "rename")
    bob.call("GET", f"/api/quizzes/{qid}", note="private, not his")
    bob.call("PUT", f"/api/quizzes/{qid}", {"title": "x", "studyFieldId": 4, "subject": "s"}, "not his")
    alice.call("PATCH", f"/api/quizzes/{qid}/visibility", {"visibility": "PUBLIC"}, "no questions")
    alice.call("PATCH", f"/api/quizzes/{qid}/visibility", {"visibility": "WEIRD"}, "bad value")

    alice.call("POST", f"/api/quizzes/{qid}/questions", {"kind": "MULTIPLE_CHOICE", "prompt": "x", "options": [{"body": "a", "isCorrect": True}]}, "one choice")
    alice.call("POST", f"/api/quizzes/{qid}/questions", {"kind": "MULTIPLE_CHOICE", "prompt": "x", "options": [{"body": "a"}, {"body": "b"}]}, "none correct")
    alice.call("POST", f"/api/quizzes/{qid}/questions", {"kind": "TYPED", "prompt": "x", "options": [{"body": " "}]}, "typed, blank")
    alice.call("POST", f"/api/quizzes/{qid}/questions", {"kind": "NOPE", "prompt": "", "timeLimitSeconds": 9999, "options": []}, "bad fields")
    detail = alice.call(
        "POST", f"/api/quizzes/{qid}/questions",
        {"kind": "MULTIPLE_CHOICE", "prompt": "Which is a Rust web framework?", "explanation": "By Tokio.",
         "options": [{"body": "Axum", "isCorrect": True}, {"body": "Rails"}, {"body": "Django"}]},
    )
    detail = alice.call(
        "POST", f"/api/quizzes/{qid}/questions",
        {"kind": "TYPED", "prompt": "Name the language", "timeLimitSeconds": 5, "options": [{"body": "Rust"}, {"body": "rustlang"}]},
    )
    q1, q2 = (q["id"] for q in detail["questions"])
    alice.call("PUT", f"/api/questions/{q1}", {"kind": "MULTIPLE_CHOICE", "prompt": "Which is a Rust web framework?", "explanation": "By Tokio.",
         "options": [{"body": "Axum", "isCorrect": True}, {"body": "Rails"}, {"body": "Django"}]}, "edit")
    bob.call("PUT", f"/api/questions/{q1}", {"kind": "TYPED", "prompt": "x", "options": [{"body": "y"}]}, "not his")
    alice.call("PATCH", f"/api/quizzes/{qid}/order", {"questionIds": [q1]}, "not a permutation")
    alice.call("PATCH", f"/api/quizzes/{qid}/order", {"questionIds": [q2, q1]})
    alice.call("PUT", f"/api/questions/{q2}/archive")
    alice.call("GET", f"/api/quizzes/{qid}", note="with an archived question")
    alice.call("DELETE", f"/api/questions/{q2}/archive")
    alice.call("PATCH", f"/api/quizzes/{qid}/visibility", {"visibility": "PUBLIC"})
    bob.call("GET", f"/api/quizzes/{qid}", note="public: no questions for him")
    visitor.call("GET", "/api/quizzes/public?studyField=technology")
    visitor.call("GET", "/api/quizzes/public?limit=1&offset=0")
    visitor.call("GET", "/api/quizzes/subjects?studyField=technology")
    alice.call("GET", "/api/quizzes/subjects?scope=mine")
    alice.call("GET", "/api/quizzes")
    alice.call("GET", "/api/quizzes?archived=true")
    bob.call("PUT", f"/api/quizzes/{qid}/archive")
    bob.call("GET", "/api/quizzes/public?archived=true", note="bob archived it")
    bob.call("DELETE", f"/api/quizzes/{qid}/archive")

    # --- attempts ------------------------------------------------------------------------
    bob.call("POST", "/api/attempts", {"quizId": "x"}, "bad id")
    started = bob.call("POST", "/api/attempts", {"quizId": qid})
    aid = started["attemptId"]
    # The quiz was reordered above, so the typed question comes first.
    bob.call("GET", f"/api/attempts/{aid}/current")
    alice.call("GET", f"/api/attempts/{aid}", note="not hers")
    bob.call("POST", f"/api/attempts/{aid}/answer", {"text": "x" * 501}, "too long")
    bob.call("POST", f"/api/attempts/{aid}/answer", {"text": " RUSTLANG. "})
    current = bob.call("GET", f"/api/attempts/{aid}/current")
    axum = next(o["id"] for o in current["options"] if o["body"] == "Axum")
    bob.call("POST", f"/api/attempts/{aid}/answer", {"optionId": axum})
    bob.call("POST", f"/api/attempts/{aid}/answer", {"text": "again"}, "already finished")
    bob.call("GET", f"/api/attempts/{aid}/current", note="finished")
    bob.call("GET", f"/api/attempts/{aid}")
    bob.call("GET", "/api/attempts")
    early = bob.call("POST", "/api/attempts", {"quizId": qid})
    bob.call("POST", f"/api/attempts/{early['attemptId']}/finish")
    bob.call("DELETE", f"/api/attempts/{early['attemptId']}")
    bob.call("DELETE", f"/api/attempts/{early['attemptId']}", note="again")

    # --- messages, settings, admin, delete ---------------------------------------------------
    visitor.call("POST", "/api/messages", {"name": "x" * 81, "email": "nope", "body": "  "}, "invalid")
    visitor.call("POST", "/api/messages", {"name": " Ada ", "email": "", "body": " hello "})
    visitor.call("POST", "/api/messages", {"body": "again"}, "daily limit")
    visitor.call("PUT", "/api/settings", {"registrationEnabled": False}, "signed out")
    alice.call("PUT", "/api/settings", {"registrationEnabled": False}, "not admin")
    root.call("PUT", "/api/settings", {"registrationEnabled": "no"}, "not a bool")
    root.call("PUT", "/api/settings", {"registrationEnabled": False})
    visitor.call("POST", "/api/auth/register", {"username": "ct_new", "email": "n@example.com", "password": "a long enough phrase"}, "closed")
    visitor.call("GET", "/api/settings")
    root.call("PUT", "/api/settings", {"registrationEnabled": True})
    root.call("DELETE", f"/api/quizzes/{qid}", note="admin removes a public quiz")
    alice.call("GET", f"/api/quizzes/{qid}", note="gone")
    alice.call("POST", "/api/auth/logout")
    alice.call("GET", "/api/auth/me", note="after logout")

    return normalise(t)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--cleanup"]:
        cleanup()
    else:
        prepare()
        try:
            print(json.dumps(scenario(args[0].rstrip("/")), indent=2, sort_keys=True, ensure_ascii=False))
        finally:
            cleanup()
