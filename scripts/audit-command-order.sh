#!/usr/bin/env bash
# Audit #[tauri::command] parameter ordering against the canonical tuple
# (state, id/key, data, options). Thin wrapper around audit-command-order.py.
#
# Usage:
#   ./scripts/audit-command-order.sh                 # human-readable report
#   ./scripts/audit-command-order.sh --update-json   # also patch watermarks.local.json
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/audit-command-order.py" "$@"
