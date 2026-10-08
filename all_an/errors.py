"""One error type for everything the app reports to a client, and how it is shown.

The API speaks `{"message": ..., ...details}` JSON; pages show the same message in a page or, for
an HTMX request, as a small fragment. Anything that is not an ApiError is a bug or an outage: it
is logged with its traceback and the client gets a bare 500 - a stack trace in a response body is
a gift to whoever is probing.
"""

from flask import Flask, jsonify, request


class ApiError(Exception):
    def __init__(self, status: int, message: str, **details):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details

    # --- the ones the app raises, named for what went wrong ---

    @classmethod
    def bad_request(cls, message: str, **details):
        return cls(400, message, **details)

    @classmethod
    def invalid_fields(cls, fields: dict[str, str]):
        return cls(400, "That request was not valid.", fields=fields)

    @classmethod
    def bad_request_field(cls, message: str, field: str, text: str):
        return cls(400, message, fields={field: text})

    @classmethod
    def unauthorized(cls, message: str = "Sign in to do that."):
        return cls(401, message)

    @classmethod
    def forbidden(cls, message: str = "That is not yours to change."):
        return cls(403, message)

    @classmethod
    def not_found(cls, message: str = "Not found."):
        return cls(404, message)

    @classmethod
    def conflict(cls, message: str):
        return cls(409, message)

    @classmethod
    def too_many_requests(cls, message: str, **details):
        return cls(429, message, **details)

    def body(self) -> dict:
        return {"message": self.message, **self.details}


def wants_json() -> bool:
    return request.path.startswith("/api/")


def register_error_handlers(app: Flask) -> None:
    from flask import render_template
    from werkzeug.exceptions import HTTPException

    def show(status: int, message: str, body: dict):
        if wants_json():
            return jsonify(body), status

        if request.headers.get("HX-Request"):
            # A fragment, not a page: HTMX swaps this into the notice region.
            return (
                render_template("partials/notice.html", message=message),
                status,
                {"HX-Retarget": "#page-error", "HX-Reswap": "innerHTML"},
            )

        return render_template("error.html", status=status, message=message), status

    @app.errorhandler(ApiError)
    def api_error(error: ApiError):
        response = show(error.status, error.message, error.body())

        # Tell the client how long to wait, in the header it expects as well as in the body.
        if error.status == 429 and "retryAfterSeconds" in error.details:
            body, status, *rest = response
            headers = dict(rest[0]) if rest else {}
            headers["Retry-After"] = str(error.details["retryAfterSeconds"])
            return body, status, headers

        return response

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        message = "Not found." if error.code == 404 else (error.description or "Error")
        return show(error.code or 500, message, {"message": message})

    @app.errorhandler(Exception)
    def unexpected(error: Exception):
        app.logger.exception("Unhandled error")
        message = "Something went wrong. Please try again."
        return show(500, message, {"message": message})
