#!/bin/bash
set -euo pipefail
# Copy control-plane configs into the image vendor tree: /opt/gameserveros/vendor
REPO_ROOT="${1:?repo root}"
DEST="${2:?destination dir}"

install -d -m0755 "$DEST/config/sysctl" "$DEST/config/apparmor" "$DEST/nftables"
cp -a "$REPO_ROOT/config/sysctl/." "$DEST/config/sysctl/"
cp -a "$REPO_ROOT/config/apparmor/." "$DEST/config/apparmor/" 2>/dev/null || true
cp -a "$REPO_ROOT/gameserveros/nftables/." "$DEST/nftables/"
