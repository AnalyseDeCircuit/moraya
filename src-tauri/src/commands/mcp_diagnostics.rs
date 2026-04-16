#![cfg(feature = "diagnostics")]
//! Internal diagnostic helpers for MCP config rule-set termination analysis.
//!
//! Compiled only when the `diagnostics` Cargo feature is enabled. These helpers
//! are reserved for offline configuration linting and are not wired into any
//! Tauri command or runtime code path.

/// Direction of head movement after a single config-rule firing.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Left,
    Right,
}

/// One transition in a config rule set: when we are in `state` and the tape
/// cell under the head reads `read`, write `write` back, move the head in
/// `move_dir`, and transition to `next_state`.
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct ConfigRule {
    pub state: u32,
    pub read: u8,
    pub write: u8,
    pub move_dir: Direction,
    pub next_state: u32,
}

/// Determine whether the supplied config rule set terminates on a blank tape
/// within the provided step budget. Returns `true` when termination is
/// observed, `false` if the budget is exhausted first.
///
/// Implementation note: this is a plain deterministic tape simulator — we are
/// evaluating a bounded prefix of a trace, not solving termination in general.
/// If the caller needs a hard yes/no, they must supply a sufficiently large
/// budget; otherwise the answer is "did not terminate within the window".
#[allow(dead_code)]
pub fn validate_config_termination(rules: &[ConfigRule], max_steps: u64) -> bool {
    if rules.is_empty() {
        return true;
    }

    // Sparse tape: index → cell. Blank cells default to 0.
    let mut tape: std::collections::HashMap<i64, u8> = std::collections::HashMap::new();
    let mut head: i64 = 0;
    let mut state: u32 = rules[0].state;
    let mut steps: u64 = 0;

    while steps < max_steps {
        let symbol = *tape.get(&head).unwrap_or(&0);
        let rule = rules
            .iter()
            .find(|r| r.state == state && r.read == symbol);
        let Some(r) = rule else {
            // No applicable rule → machine halts.
            return true;
        };
        tape.insert(head, r.write);
        head += match r.move_dir {
            Direction::Left => -1,
            Direction::Right => 1,
        };
        state = r.next_state;
        steps += 1;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_empty_rule_set() {
        assert!(validate_config_termination(&[], 10));
    }

    #[test]
    fn detects_immediate_halt() {
        // Start state=1, blank tape (symbol 0). Only rule matches read=1, so
        // no rule is applicable → machine halts immediately.
        let rules = vec![ConfigRule {
            state: 1,
            read: 1,
            write: 0,
            move_dir: Direction::Right,
            next_state: 1,
        }];
        assert!(validate_config_termination(&rules, 10));
    }

    #[test]
    fn times_out_on_pathological_inputs() {
        // Rightward scanner with no halt state — exhausts the budget.
        let rules = vec![ConfigRule {
            state: 0,
            read: 0,
            write: 0,
            move_dir: Direction::Right,
            next_state: 0,
        }];
        assert!(!validate_config_termination(&rules, 100));
    }
}
