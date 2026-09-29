#!/usr/bin/env bash
# Cloud Agent install script for Automedia.
#
# Idempotent bootstrap that prepares everything the studio, its validation, and
# its export pipeline need:
#   - Node/pnpm dependencies (pinned via the lockfile).
#   - The Playwright Chromium build used for validation and export, plus its
#     system libraries.
# Encoding runs in-process through Mediabunny, so no ffmpeg install is needed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n[install] %s\n' "$*"; }

log "Installing Node dependencies with pnpm (frozen lockfile) ..."
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile

log "Installing the Playwright Chromium build ..."
pnpm exec playwright install chromium

log "Installing Chromium system libraries ..."
NODE_BIN_DIR="$(dirname "$(command -v node)")"
sudo env "PATH=$NODE_BIN_DIR:$PATH" pnpm exec playwright install-deps chromium

log "Install complete."
