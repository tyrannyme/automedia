#!/usr/bin/env bash
# Cloud Agent install script for Automedia.
#
# Idempotent bootstrap that prepares everything the studio, its validation, and
# its export pipeline need:
#   - Node/pnpm dependencies (pinned via the lockfile).
#   - The Playwright Chromium build used for validation and export, plus its
#     system libraries.
#   - An ffmpeg/ffprobe build that ships the codecs the exporter requires
#     (libopenh264 for MP4, libvpx-vp9/libopus for WebM, libwebp for WebP, and
#     the GIF palette filters). Ubuntu's stock ffmpeg omits libopenh264, so a
#     self-contained GPL build is installed ahead of it on PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n[install] %s\n' "$*"; }

# Ubuntu ffmpeg lacks libopenh264, which the MP4 exporter requires. Install a
# static GPL build (which bundles every codec the exporter uses) only when the
# ffmpeg already on PATH cannot satisfy the requirement.
FFMPEG_VERSION_TAG="ffmpeg-n8.1-latest-linux64-gpl-8.1"
FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${FFMPEG_VERSION_TAG}.tar.xz"

ffmpeg_has_openh264() {
  command -v ffmpeg >/dev/null 2>&1 || return 1
  # Use a plain grep (not -q) so the encoder list is fully consumed; with
  # `set -o pipefail`, a short-circuiting `grep -q` can SIGPIPE ffmpeg and make
  # the pipeline look like a failure even when the codec is present.
  ffmpeg -hide_banner -encoders 2>/dev/null | grep -F "libopenh264" >/dev/null
}

install_ffmpeg() {
  if ffmpeg_has_openh264; then
    log "ffmpeg with libopenh264 already present ($(command -v ffmpeg)); skipping download."
    return
  fi
  log "Installing static ffmpeg/ffprobe with libopenh264 into /usr/local/bin ..."
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  curl -fSL --retry 4 --retry-delay 2 -o "$tmp/ffmpeg.tar.xz" "$FFMPEG_URL"
  tar -xf "$tmp/ffmpeg.tar.xz" -C "$tmp"
  local dir="$tmp/${FFMPEG_VERSION_TAG}"
  sudo install -m 0755 "$dir/bin/ffmpeg" /usr/local/bin/ffmpeg
  sudo install -m 0755 "$dir/bin/ffprobe" /usr/local/bin/ffprobe
  hash -r
  if ! ffmpeg_has_openh264; then
    echo "[install] ERROR: ffmpeg still lacks libopenh264 after install" >&2
    exit 1
  fi
  log "ffmpeg ready: $(ffmpeg -hide_banner -version | head -1)"
}

install_ffmpeg

log "Installing Node dependencies with pnpm (frozen lockfile) ..."
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile

log "Installing the Playwright Chromium build ..."
pnpm exec playwright install chromium

log "Installing Chromium system libraries ..."
NODE_BIN_DIR="$(dirname "$(command -v node)")"
sudo env "PATH=$NODE_BIN_DIR:$PATH" pnpm exec playwright install-deps chromium

log "Install complete."
