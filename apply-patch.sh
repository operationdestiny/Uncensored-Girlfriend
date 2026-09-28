#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-}"
if [[ -z "$TARGET" || ! -d "$TARGET" ]]; then
  echo "Usage: $0 /path/to/EverBond-AI" >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -a "$SCRIPT_DIR/files/." "$TARGET/"
echo "EverBond social publishing patch copied into: $TARGET"
echo "Next: read PATCH_README.md, run the Pinterest SQL once, configure Vercel OAuth/env values, and deploy."
