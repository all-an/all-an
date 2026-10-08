"""Email through Resend's HTTP API.

HTTP rather than SMTP because Render blocks outbound SMTP ports on free instances, so an SMTP
client would simply time out there.
"""

import html
import logging

import requests

log = logging.getLogger(__name__)

ENDPOINT = "https://api.resend.com/emails"


def escape_html(value: str) -> str:
    """For the HTML half of an email, where a username like `<b>x` must not become markup."""
    return html.escape(value, quote=True)


def send(config, *, to: str, subject: str, text: str, html_body: str) -> None:
    """Sends one email, or says it is skipping when no key is configured - local development and
    forks of the repo work without an email account.

    Never raises: a notification that fails must not undo the share that triggered it. The failure
    is logged and the share stands.
    """
    if not (config.resend_api_key and config.mail_from):
        log.info('Email not configured; skipping "%s" to %s.', subject, to)
        return

    try:
        response = requests.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {config.resend_api_key}"},
            json={"from": config.mail_from, "to": [to], "subject": subject, "html": html_body, "text": text},
            timeout=10,
        )

        if not response.ok:
            log.error("Email to %s rejected: %s %s", to, response.status_code, response.text)
    except requests.RequestException as error:
        log.error("Email to %s failed: %s", to, error)
