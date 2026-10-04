//! Password hashing: scrypt, stored as `scrypt$N$r$p$salt$hash` with the salt and hash in
//! unpadded base64url.
//!
//! This is byte-for-byte the format the Node version wrote, so every existing account keeps
//! working across the rewrite. Parameters are read back out of the stored string, which is what
//! lets the cost be raised later without invalidating anyone.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use scrypt::Params;
use subtle::ConstantTimeEq;

const LOG_N: u8 = 14; // N = 16384, about 16 MB per hash.
const R: u32 = 8;
const P: u32 = 1;
const KEY_LENGTH: usize = 64;
const SALT_LENGTH: usize = 16;

/// A hash stored by this app asks for a modest amount of memory. One that asks for gigabytes was
/// not written by us, and verifying it would hand its author a denial of service.
const MAX_LOG_N: u8 = 16;

fn derive(password: &str, salt: &[u8], log_n: u8, r: u32, p: u32, len: usize) -> Option<Vec<u8>> {
    let params = Params::new(log_n, r, p).ok()?;
    let mut out = vec![0u8; len];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut out).ok()?;
    Some(out)
}

/// scrypt is deliberately slow and memory-hungry, so it runs on the blocking pool rather than
/// stalling the async executor for everyone else.
pub async fn hash(password: String) -> String {
    tokio::task::spawn_blocking(move || {
        let mut salt = [0u8; SALT_LENGTH];
        rand::fill(&mut salt[..]);

        let derived = derive(&password, &salt, LOG_N, R, P, KEY_LENGTH)
            .expect("fixed scrypt parameters are valid");

        format!(
            "scrypt${}${R}${P}${}${}",
            1u64 << LOG_N,
            URL_SAFE_NO_PAD.encode(salt),
            URL_SAFE_NO_PAD.encode(derived)
        )
    })
    .await
    .expect("password hashing task panicked")
}

pub async fn verify(password: String, stored: String) -> bool {
    tokio::task::spawn_blocking(move || verify_blocking(&password, &stored))
        .await
        .unwrap_or(false)
}

fn verify_blocking(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();

    let [scheme, n, r, p, salt, hash] = parts.as_slice() else {
        return false;
    };

    if *scheme != "scrypt" {
        return false;
    }

    let (Ok(n), Ok(r), Ok(p)) = (n.parse::<u64>(), r.parse::<u32>(), p.parse::<u32>()) else {
        return false;
    };

    if n < 2 || !n.is_power_of_two() {
        return false;
    }

    let log_n = n.trailing_zeros() as u8;

    if log_n > MAX_LOG_N {
        return false;
    }

    let (Ok(salt), Ok(expected)) = (URL_SAFE_NO_PAD.decode(salt), URL_SAFE_NO_PAD.decode(hash))
    else {
        return false;
    };

    if salt.is_empty() || expected.is_empty() {
        return false;
    }

    let Some(derived) = derive(password, &salt, log_n, r, p, expected.len()) else {
        return false;
    };

    derived.ct_eq(&expected).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trips() {
        let stored = hash("correct horse battery".to_string()).await;

        assert!(stored.starts_with("scrypt$16384$8$1$"));
        assert!(verify("correct horse battery".to_string(), stored.clone()).await);
        assert!(!verify("correct horse batterz".to_string(), stored).await);
    }

    /// Written by Node's crypto.scrypt, as the old server did. If this stops verifying, every
    /// existing account has been locked out.
    #[test]
    fn verifies_a_hash_written_by_the_node_version() {
        let stored = "scrypt$16384$8$1$rYXvIGxI4ayfib2N3Z4Reg$bhoK-b9VKngSZtxlbKczGi-DFes0LxQ-FbEm9WgcI5PfQvLYx_xxXrweI-TRdFchSPpekmNPxDV0v5TWAlutHA";

        assert!(verify_blocking("pässword with spaces", stored));
        assert!(!verify_blocking("password with spaces", stored));
    }

    #[test]
    fn rejects_malformed_hashes() {
        assert!(!verify_blocking("x", "not-a-hash"));
        assert!(!verify_blocking("x", "bcrypt$1$2$3$4$5"));
        assert!(!verify_blocking("x", "scrypt$abc$8$1$AAAA$AAAA"));
        assert!(!verify_blocking("x", "scrypt$16384$8$1$$AAAA"));
    }

    #[test]
    fn refuses_hashes_that_ask_for_absurd_memory() {
        let stored = format!("scrypt${}$8$1$AAAA$AAAA", 1u64 << 30);
        assert!(!verify_blocking("x", &stored));
    }
}
