#!/bin/bash
#
# Install the chat.db poke LaunchAgent. Idempotent -- safe to re-run after a
# code change; it re-renders the plist and kickstarts the job.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.nortakales.chat-db-poke"
LOG_DIR="$HOME/Library/Logs/bluebubbles"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TEMPLATE="${SCRIPT_DIR}/${LABEL}.plist.template"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
chmod +x "${SCRIPT_DIR}/chat-db-poke.sh"

sed -e "s|__SCRIPT_DIR__|${SCRIPT_DIR}|g" \
    -e "s|__LOG_DIR__|${LOG_DIR}|g" \
    "$TEMPLATE" > "$PLIST"

plutil -lint "$PLIST" >/dev/null

# bootout first so a changed plist is actually picked up; ignore "not loaded".
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
# No -k: this is a short periodic job, and killing an in-flight run just
# leaves a spurious SIGTERM as its "last exit". bootstrap + RunAtLoad has
# already started it; this only forces one immediate run.
launchctl kickstart "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "Installed ${LABEL}"
# Report runs/exit code, not "state": this is a StartInterval job, so it is
# legitimately "not running" between its 30s wakeups and printing that would
# look like a failure.
launchctl print "gui/$(id -u)/${LABEL}" | grep -E "runs|last exit code" || true
echo "Healthy = 'runs' climbing with 'last exit code = 0'."
echo "Log (written only when it actually pokes): ${LOG_DIR}/chat-db-poke.log"
