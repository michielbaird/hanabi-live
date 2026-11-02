#!/usr/bin/env bash
# Rebuilds the bot's game analysis for the browser (public/wasm) from a checkout of hanab-bot-rs.
# Usage: scripts/bash/build_analysis_wasm.sh [path to hanab-bot-rs, default ../hanab-bot-rs]
set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT="$DIR/../.."
BOT="${1:-$REPO_ROOT/../hanab-bot-rs}"
"$BOT/wasm/build.sh"
mkdir -p "$REPO_ROOT/public/wasm"
cp "$BOT/wasm/pkg/hanab_bot_wasm.js" "$BOT/wasm/pkg/hanab_bot_wasm_bg.wasm" "$REPO_ROOT/public/wasm/"
# The bot needs the same variant tables as the client.
cp "$REPO_ROOT/packages/game/src/json/variants.json" "$REPO_ROOT/packages/game/src/json/suits.json" "$REPO_ROOT/public/wasm/"
