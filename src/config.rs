use std::env;

/// Everything the process reads from its environment, read once at startup.
#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    /// Render terminates TLS at its proxy and forwards the real client in X-Forwarded-For. Only
    /// safe when a proxy of ours sets that header itself - exposed directly to the internet, with
    /// this on, anyone could spoof their address past the per-IP throttles. Off by default.
    pub trust_proxy_headers: bool,
    pub session_cookie_secure: bool,
    pub site_url: String,
    pub resend_api_key: Option<String>,
    pub mail_from: Option<String>,
    pub admin_username: Option<String>,
    pub admin_email: Option<String>,
    pub admin_password: Option<String>,
}

fn non_empty(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.is_empty())
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = non_empty("PORT")
            .map(|raw| raw.parse::<u16>())
            .transpose()?
            .unwrap_or(8080);

        let database_url = non_empty("DATABASE_URL").ok_or_else(|| {
            anyhow::anyhow!(
                "DATABASE_URL is not set. Locally: postgresql://allan:allan@localhost:5432/all-an-database"
            )
        })?;

        Ok(Self {
            database_url,
            port,
            trust_proxy_headers: env::var("TRUST_PROXY_HEADERS").is_ok_and(|v| v == "true"),
            session_cookie_secure: env::var("SESSION_COOKIE_SECURE").is_ok_and(|v| v == "true"),
            site_url: non_empty("SITE_URL").unwrap_or_else(|| format!("http://localhost:{port}")),
            resend_api_key: non_empty("RESEND_API_KEY"),
            mail_from: non_empty("MAIL_FROM"),
            admin_username: non_empty("ADMIN_USERNAME"),
            admin_email: non_empty("ADMIN_EMAIL"),
            admin_password: non_empty("ADMIN_PASSWORD"),
        })
    }
}
