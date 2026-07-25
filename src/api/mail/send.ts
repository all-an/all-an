/**
 * Outbound email, through Resend's HTTP API.
 *
 * HTTP rather than SMTP because Render blocks outbound SMTP ports on its free instances, so a
 * nodemailer setup would simply time out there. An HTTP call also needs no dependency - this is
 * one fetch.
 */
const ENDPOINT = 'https://api.resend.com/emails';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email, or does nothing if the environment is not configured for it.
 *
 * Failing soft is deliberate. Sharing a quiz is the user's action; the email is a courtesy on top
 * of it. A local checkout with no API key, or a provider having a bad afternoon, must not turn a
 * successful share into an error - the share is already in the recipient's list either way.
 * Failures are logged rather than raised.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['MAIL_FROM'];

  if (!apiKey || !from) {
    console.log(`Email not configured; skipping "${mail.subject}" to ${mail.to}.`);
    return;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }),
      // Without a deadline a hung provider would hold the request open, and the user would watch
      // a spinner over a share that has already been saved.
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      console.error(`Email to ${mail.to} rejected: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error(`Email to ${mail.to} failed`, error);
  }
}

/** Escapes text for interpolation into the HTML body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The site's own address, for links in emails. Falls back to localhost for a local run. */
export function siteUrl(): string {
  return process.env['SITE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 8080}`;
}
