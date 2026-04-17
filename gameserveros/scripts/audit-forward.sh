#!/bin/bash
set -euo pipefail
# Ship recent audit lines into a one-shot file the agent can read (extend heartbeat later).
OUT_DIR="/var/lib/steamline"
OUT_FILE="$OUT_DIR/audit-recent.log"
install -d -m0700 "$OUT_DIR"
if command -v ausearch >/dev/null 2>&1; then
  ausearch -ts recent 2>/dev/null | tail -n 200 >"$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE" || true
else
  journalctl -u auditd -n 200 --no-pager >"$OUT_FILE.tmp" 2>/dev/null && mv "$OUT_FILE.tmp" "$OUT_FILE" || true
fi
