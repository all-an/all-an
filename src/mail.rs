use std::time::Duration;

use serde_json::json;

use crate::config::Config;

const ENDPOINT: &str = "https://api.resend.com/emails";

pub struct Mail {
    pub to: String,
    pub subject: String,
    pub html: String,
    pub text: String,
}

/// Sends through Resend, or says it is skipping when no key is configured - local development and
/// forks of the repo work without an email account.
///
/// Never returns an error: a notification that fails must not undo the share that triggered it.
/// The failure is logged and the share stands.
pub async fn send(config: &Config, client: &reqwest::Client, mail: Mail) {
    let (Some(api_key), Some(from)) = (&config.resend_api_key, &config.mail_from) else {
        tracing::info!("Email not configured; skipping \"{}\" to {}.", mail.subject, mail.to);
        return;
    };

    let result = client
        .post(ENDPOINT)
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(10))
        .json(&json!({
            "from": from,
            "to": [mail.to],
            "subject": mail.subject,
            "html": mail.html,
            "text": mail.text,
        }))
        .send()
        .await;

    match result {
        Ok(response) if !response.status().is_success() => {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            tracing::error!("Email to {} rejected: {status} {body}", mail.to);
        }
        Ok(_) => {}
        Err(error) => tracing::error!("Email to {} failed: {error}", mail.to),
    }
}

/// For the HTML half of an email, where a username like `<b>x` must not become markup.
pub fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
