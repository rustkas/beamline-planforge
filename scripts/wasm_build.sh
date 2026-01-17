#!/usr/bin/env bash
set -euo pipefail
if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for wasm build"
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/wasm_build.sh <path>"
  exit 1
fi

bun tools/wasm/cli.ts build "$1"
