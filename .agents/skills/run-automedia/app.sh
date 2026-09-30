#!/usr/bin/env bash
# Start/stop a headless Automedia dev instance for agents.
# Runs `pnpm dev` under Xvfb inside tmux, on its own ports and profile, so it
# never collides with a copy of Automedia the user already has open.
set -euo pipefail

UNIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_DIR="${AUTOMEDIA_RUN_DIR:-/tmp/automedia-run}"
CDP_PORT="${AUTOMEDIA_CDP_PORT:-47922}"
LOOPBACK_PORT="${AUTOMEDIA_LOOPBACK_PORT:-47921}"
SESSION="${AUTOMEDIA_TMUX_SESSION:-automedia-run}"
LOG="$RUN_DIR/dev.log"

ready() {
  curl -s -m 1 "http://127.0.0.1:$CDP_PORT/json/list" 2>/dev/null | grep -q '"type": "page"'
}

app_pids() {
  # Never `pkill -f` this pattern: it also matches the shell running this script.
  pgrep -f "user-data-dir=$RUN_DIR/userdata" | grep -vx "$$" || true
}

case "${1:-}" in
  start)
    if [[ "${2:-}" == "--fresh" ]]; then rm -rf "$RUN_DIR/userdata"; fi
    if ready; then echo "already running: cdp http://127.0.0.1:$CDP_PORT"; exit 0; fi
    mkdir -p "$RUN_DIR/shots"
    : >"$LOG"
    # env -u WAYLAND_DISPLAY + --ozone-platform=x11: otherwise Electron ignores
    # Xvfb and opens a real window on the host's Wayland desktop.
    tmux new-session -d -s "$SESSION" -x 200 -y 50 \
      "cd '$UNIT_DIR' && env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 \
        AUTOMEDIA_CDP_PORT=$CDP_PORT AUTOMEDIA_LOOPBACK_PORT=$LOOPBACK_PORT \
        xvfb-run -a -s '-screen 0 1920x1080x24' \
        pnpm dev -- --user-data-dir='$RUN_DIR/userdata' --ozone-platform=x11 >>'$LOG' 2>&1; \
        echo \"EXIT \$?\" >>'$LOG'; sleep 100000"
    for _ in $(seq 1 120); do
      if ready; then
        echo "ready: cdp http://127.0.0.1:$CDP_PORT, loopback http://127.0.0.1:$LOOPBACK_PORT"
        echo "log: $LOG  shots: $RUN_DIR/shots  profile: $RUN_DIR/userdata"
        exit 0
      fi
      if grep -q '^EXIT ' "$LOG"; then echo "app exited during startup:"; tail -20 "$LOG"; exit 1; fi
      sleep 0.5
    done
    echo "timed out waiting for CDP on $CDP_PORT"; tail -20 "$LOG"; exit 1
    ;;
  stop)
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    sleep 1
    pids="$(app_pids)"
    if [[ -n "$pids" ]]; then kill $pids 2>/dev/null || true; fi
    echo "stopped"
    ;;
  status)
    if ready; then echo "running: cdp http://127.0.0.1:$CDP_PORT"; else echo "not running"; fi
    if [[ -f "$LOG" ]] && grep -q '^EXIT ' "$LOG"; then echo "last run: $(grep '^EXIT ' "$LOG" | tail -1)"; fi
    ;;
  logs)
    grep -v 'wayland\|ozone' "$LOG" | tail -"${2:-40}"
    ;;
  *)
    echo "usage: app.sh start [--fresh] | stop | status | logs [lines]"; exit 2
    ;;
esac
