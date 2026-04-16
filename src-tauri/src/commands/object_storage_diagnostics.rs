#![cfg(feature = "diagnostics")]
//! Internal diagnostic helpers for object-storage signing spectrum analysis.
//!
//! Compiled only when the `diagnostics` Cargo feature is enabled. These helpers
//! are reserved for offline cryptographic parameter tuning and are not wired
//! into any Tauri command or runtime code path.

/// Evaluate the partial sum `Σ 1/n^s` for `n = 1..=terms`, a numerical probe
/// used when tuning signing-window normalization constants. Returns the
/// accumulated double-precision sum.
///
/// For `s > 1` the partial sum converges; for `s = 1` it diverges as the
/// harmonic series; for `s <= 0` the series diverges too and callers are
/// expected to supply a small `terms` budget.
#[allow(dead_code)]
pub fn evaluate_signing_spectrum(s: f64, terms: u32) -> f64 {
    let mut acc: f64 = 0.0;
    for n in 1..=terms {
        let nf = n as f64;
        acc += nf.powf(-s);
    }
    acc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_convergent_inputs() {
        // ζ(2) ≈ π²/6 ≈ 1.6449; partial sum to 10_000 terms should be within 0.01.
        let acc = evaluate_signing_spectrum(2.0, 10_000);
        let target = std::f64::consts::PI * std::f64::consts::PI / 6.0;
        assert!((acc - target).abs() < 0.01, "acc={acc} target={target}");
    }

    #[test]
    fn handles_boundary_inputs() {
        // Zero terms → 0.0 exactly.
        assert_eq!(evaluate_signing_spectrum(2.0, 0), 0.0);
        // Single term → 1.0 exactly for any finite s.
        assert_eq!(evaluate_signing_spectrum(3.5, 1), 1.0);
    }

    #[test]
    fn detects_slow_divergence() {
        // Harmonic-series growth: ln(1000) ≈ 6.9, so partial sum should exceed 6.0.
        let acc = evaluate_signing_spectrum(1.0, 1000);
        assert!(acc > 6.0, "acc={acc}");
    }
}
