#!/usr/bin/env bash
# Update watermarks.local.json and (optionally) renew its OpenTimestamps proof.
#
# Usage:
#   ./scripts/watermark-update.sh                  # validate + stamp
#   ./scripts/watermark-update.sh --skip-stamp     # validate only
#
# Requirements:
#   jq   — validate JSON syntax
#   ots  — OpenTimestamps CLI (https://github.com/opentimestamps/opentimestamps-client)
#           install: pip install opentimestamps-client
#
# This script never commits; do `git commit -S` manually afterward.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WM="$REPO_ROOT/watermarks.local.json"

skip_stamp=0
if [ "${1:-}" = "--skip-stamp" ]; then
  skip_stamp=1
fi

if [ ! -f "$WM" ]; then
  echo "error: watermarks.local.json not found at $WM" >&2
  echo "hint: run 'cp watermarks.local.example.json watermarks.local.json' first" >&2
  exit 1
fi

# 1. JSON validation
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not installed" >&2
  exit 1
fi
jq empty "$WM" >/dev/null
echo "✓ JSON valid"

# 2. SHA-256 record for logs (not committed, just echoed)
if command -v shasum >/dev/null 2>&1; then
  sha=$(shasum -a 256 "$WM" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  sha=$(sha256sum "$WM" | awk '{print $1}')
else
  sha="(no sha tool)"
fi
echo "  sha256: $sha"

# 3. OpenTimestamps stamp
if [ $skip_stamp -eq 1 ]; then
  echo "skip: --skip-stamp given, not calling ots"
  exit 0
fi

if ! command -v ots >/dev/null 2>&1; then
  echo "warn: ots (opentimestamps-client) not installed; skipping stamp step." >&2
  echo "      install with: pip install opentimestamps-client" >&2
  exit 0
fi

ots stamp "$WM"
echo "✓ Stamp created: ${WM}.ots"
echo ""
echo "Reminder: upload watermarks.local.json + watermarks.local.json.ots to:"
echo "  • 1Password Vault 'Moraya Watermarks'"
echo "  • Your private gist (encrypted archive)"
echo "Then GPG-sign the related commit: git commit -S"
