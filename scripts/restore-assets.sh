#!/bin/sh
# Restores binary assets (fonts, brand PNGs, design artwork) into
# public/assets/ at Docker build time.
#
# Two sources, in order:
#   1. assets-base64/**/*.b64  — base64 mirror tree committed to the repo
#      (used when binaries were committed via a text-only API)
#   2. scripts/asset-urls.txt  — URL manifest, downloaded with curl
#      (used for any asset still missing after step 1)
set -e

cd "$(dirname "$0")/.."

if [ -d assets-base64 ]; then
  find assets-base64 -type f -name '*.b64' | while read -r b64file; do
    rel="${b64file#assets-base64/}"
    target="public/${rel%.b64}"
    mkdir -p "$(dirname "$target")"
    base64 -d "$b64file" > "$target"
    echo "restored $target (base64)"
  done
fi

if [ -f scripts/asset-urls.txt ]; then
  while IFS="$(printf '\t')" read -r rel url; do
    case "$rel" in ''|\#*) continue ;; esac
    target="public/$rel"
    if [ ! -s "$target" ]; then
      mkdir -p "$(dirname "$target")"
      echo "downloading $target"
      curl -fsSL --retry 3 --connect-timeout 20 "$url" -o "$target"
    fi
  done < scripts/asset-urls.txt
fi
