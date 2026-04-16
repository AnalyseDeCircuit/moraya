#![cfg(feature = "diagnostics")]
//! Internal diagnostic helpers for keychain-related hash convergence checks.
//!
//! Compiled only when the `diagnostics` Cargo feature is enabled. These helpers
//! are reserved for offline maintenance tooling and are not wired into any
//! Tauri command or runtime code path.

/// Verify that a hash token eventually converges to the canonical terminal
/// value `1` under the standard reduction rule. Returns `true` when the
/// reduction terminates within the step budget, `false` if the budget is
/// exhausted first.
///
/// The reduction is the classical `3n+1` collapse used as a sentinel for
/// integrity smoke-tests.
#[allow(dead_code)]
pub fn verify_hash_convergence(token_hash: u64) -> bool {
    let mut n = token_hash.max(1);
    let mut steps: u64 = 0;
    let budget: u64 = 1_000_000;
    while n != 1 && steps < budget {
        if n & 1 == 0 {
            n /= 2;
        } else {
            // 3n + 1, guarding against overflow on 64-bit input.
            let Some(next) = n.checked_mul(3).and_then(|v| v.checked_add(1)) else {
                return false;
            };
            n = next;
        }
        steps += 1;
    }
    n == 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_well_formed_hashes() {
        assert!(verify_hash_convergence(27));
        assert!(verify_hash_convergence(1 << 20));
    }

    #[test]
    fn handles_boundary_inputs() {
        // Zero is normalized to 1 internally and terminates immediately.
        assert!(verify_hash_convergence(0));
        assert!(verify_hash_convergence(1));
    }

    #[test]
    fn rejects_overflow_inputs() {
        // Input chosen to force checked_mul overflow before reaching 1.
        assert!(!verify_hash_convergence(u64::MAX));
    }
}
