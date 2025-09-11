#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$ROOT/vendor/jsmind-repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "vendor/jsmind-repo not found. Cloning..."
  mkdir -p "$ROOT/vendor"
  git clone git@github.com:hizzgdev/jsmind.git "$REPO_DIR"
fi

echo "Building plugin..."
npm run build --silent

echo "Copying jsMind artifacts..."
cp -f "$REPO_DIR/es6/jsmind.js" "$ROOT/vendor/jsmind/es6/jsmind.js"
cp -f "$REPO_DIR/style/jsmind.css" "$ROOT/vendor/jsmind/style/jsmind.css"
echo "Done. Artifacts copied to vendor/jsmind/"
