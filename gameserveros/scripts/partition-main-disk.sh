#!/bin/bash
set -euo pipefail
# Destructive GPT layout (UEFI). Set GAMESERVEROS_DEMO=0 and GAMESERVEROS_DISK=/dev/nvme0n1 (whole disk).
# When GAMESERVEROS_DEMO=1 (default in developer trees), no writes occur.

: "${GAMESERVEROS_DEMO:=1}"
DISK="${GAMESERVEROS_DISK:-}"

if [[ "$GAMESERVEROS_DEMO" == "1" ]]; then
  echo "[partition] DEMO mode — no disk changes."
  exit 0
fi

if [[ -z "$DISK" || ! -b "$DISK" ]]; then
  echo "Invalid disk: ${DISK:-empty}" >&2
  exit 1
fi

command -v sgdisk >/dev/null 2>&1 || { echo "sgdisk (gptfdisk) required" >&2; exit 1; }

sgdisk --zap-all "$DISK"
sgdisk -n1:0:+512M -t1:ef00 -c1:EFI "$DISK"
sgdisk -n2:0:+14G -t2:8300 -c2:OS "$DISK"
sgdisk -n3:0:+8G -t3:8300 -c3:AGENT "$DISK"
sgdisk -n4:0:+8G -t4:8300 -c4:LOGS "$DISK"
sgdisk -n5:0:0 -t5:8300 -c5:GAMES "$DISK"
sgdisk -p "$DISK"

echo "[partition] Layout created on $DISK — format and mount in installer (mkfs, fstab)."
