#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$ROOT/vendor/jsmind-repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "vendor/jsmind-repo not found. Cloning..."
  mkdir -p "$ROOT/vendor"
  git clone git@github.com:hizzgdev/jsmind.git "$REPO_DIR"
fi

echo "Building jsMind..."
./build-jsmind.sh

echo "Building plugin..."
npm run build --silent

echo "Copying jsMind artifacts..."
cp -f "$REPO_DIR/es6/jsmind.js" "$ROOT/vendor/jsmind/es6/jsmind.js"
cp -f "$REPO_DIR/style/jsmind.css" "$ROOT/vendor/jsmind/style/jsmind.css"
cp -f "$REPO_DIR/es6/jsmind.screenshot.js" "$ROOT/vendor/jsmind/es6/jsmind.screenshot.js"
mkdir -p "$ROOT/vendor/dom-to-image"
if [ ! -f "$ROOT/vendor/dom-to-image/dom-to-image.min.js" ]; then
  echo "Fetching dom-to-image..."
  curl -fsSL https://unpkg.com/dom-to-image@2.6.0/dist/dom-to-image.min.js -o "$ROOT/vendor/dom-to-image/dom-to-image.min.js"
fi
echo "Done. Artifacts copied to vendor/jsmind/"

# Optional deployment when DEST is provided
if [ "${1-}" != "" ]; then
  DEST="$1"

  deploy_to_plugin_dir() {
    local plugin_dir="$1"
    echo "Installing plugin to: $plugin_dir"
    mkdir -p "$plugin_dir/vendor/jsmind/es6" "$plugin_dir/vendor/jsmind/style" "$plugin_dir/vendor/dom-to-image"
    cp -f "$ROOT/manifest.json" "$plugin_dir/"
    cp -f "$ROOT/main.js" "$plugin_dir/"
    cp -f "$ROOT/vendor/jsmind/es6/jsmind.js" "$plugin_dir/vendor/jsmind/es6/"
    cp -f "$ROOT/vendor/jsmind/es6/jsmind.screenshot.js" "$plugin_dir/vendor/jsmind/es6/"
    cp -f "$ROOT/vendor/jsmind/style/jsmind.css" "$plugin_dir/vendor/jsmind/style/"
    cp -f "$ROOT/vendor/dom-to-image/dom-to-image.min.js" "$plugin_dir/vendor/dom-to-image/"
    echo "✔ Deployed: $plugin_dir"
  }

  echo "Deploying using DEST: $DEST"
  # Case 1: DEST is an Obsidian vault root (contains .obsidian)
  if [ -d "$DEST/.obsidian" ]; then
    PLUGIN_DIR="$DEST/.obsidian/plugins/obsidian-mindmap-jsmind"
    deploy_to_plugin_dir "$PLUGIN_DIR"
  # Case 2: DEST is already the plugin directory
  elif [[ "$DEST" == *".obsidian/plugins/obsidian-mindmap-jsmind"* ]]; then
    deploy_to_plugin_dir "$DEST"
  # Case 3: DEST looks like Obsidian Documents root containing multiple vaults
  elif [ -d "$DEST" ]; then
    echo "Scanning for vaults under: $DEST"
    shopt -s nullglob
    found_any=0
    for vault in "$DEST"/*; do
      if [ -d "$vault/.obsidian" ]; then
        found_any=1
        PLUGIN_DIR="$vault/.obsidian/plugins/obsidian-mindmap-jsmind"
        deploy_to_plugin_dir "$PLUGIN_DIR"
      fi
    done
    shopt -u nullglob
    if [ "$found_any" = "0" ]; then
      echo "No vaults found under: $DEST (expected subfolders with .obsidian)" >&2
      exit 1
    fi
  else
    echo "DEST does not exist: $DEST" >&2
    exit 1
  fi
fi
