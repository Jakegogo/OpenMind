#!/usr/bin/env bash
set -euo pipefail

# Build jsMind from vendor/jsmind-repo and copy artifacts into vendor/jsmind

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$ROOT/vendor/jsmind-repo"
TARGET="$ROOT/vendor/jsmind"

echo "Building jsMind from $REPO"
cd "$REPO"

# Install deps
npm ci --no-fund --no-audit

# Build outputs
npm run build
npm run build-types

# Ensure target directories
mkdir -p "$TARGET/es6" "$TARGET/style"

# Copy core and plugins
cp -f "$REPO/es6/jsmind.js" "$TARGET/es6/jsmind.js"
cp -f "$REPO/es6/jsmind.draggable-node.js" "$TARGET/es6/jsmind.draggable-node.js" 2>/dev/null || true
cp -f "$REPO/es6/jsmind.screenshot.js" "$TARGET/es6/jsmind.screenshot.js" 2>/dev/null || true
cp -f "$REPO/style/jsmind.css" "$TARGET/style/jsmind.css"

echo "Done. Artifacts copied to $TARGET"


