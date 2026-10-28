#!/bin/sh
set -eu
# The image build provisions one locked revision of Chromium headless shell.
# Do not substitute full Chrome: video capture needs HeadlessExperimental.
if [ -z "${AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  candidates=$(find /ms-playwright -type f \( -name headless_shell -o -name chrome-headless-shell \))
  count=$(printf '%s\n' "$candidates" | grep -c . || true)
  if [ "$count" != 1 ]; then
    echo "Expected one headless shell in /ms-playwright; set AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH explicitly." >&2
    exit 1
  fi
  export AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH="$candidates"
fi
export AUTOMEDIA_CLOUD_SMOKE=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
exec pnpm exec vitest run src/engine/cloud.integration.test.ts
