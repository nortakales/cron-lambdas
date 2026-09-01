#!/usr/bin/env bash
#
# Builds the agent and installs it as a launchd LaunchAgent that starts at login
# and restarts on failure.
#
# A LaunchAgent (user session) rather than a LaunchDaemon (root): sending an
# iMessage drives the Messages app over AppleScript, which only works inside the
# logged-in GUI session.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_DIR="${REPO_ROOT}/mac-agent"
LABEL="com.nortakales.icloud-bridge-agent"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/icloud-bridge"
# Resolving node deterministically matters more than it looks: `command -v node`
# depends on whether nvm happens to be sourced, and this box has an old Homebrew
# node v16 on PATH that cannot run the agent (no global fetch, no
# AbortSignal.timeout). launchd gets an absolute path, so it must be the right one.
MIN_NODE_MAJOR=22

node_major() { "$1" --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

NODE_BIN=""
CANDIDATES=()
[[ -n "$(command -v node || true)" ]] && CANDIDATES+=("$(command -v node)")
# Newest nvm install first.
while IFS= read -r candidate; do
  [[ -n "${candidate}" ]] && CANDIDATES+=("${candidate}")
done < <(ls -d "${HOME}"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -Vr)
CANDIDATES+=(/usr/local/bin/node /opt/homebrew/bin/node)

for candidate in "${CANDIDATES[@]}"; do
  [[ -x "${candidate}" ]] || continue
  major="$(node_major "${candidate}")"
  if [[ -n "${major}" && "${major}" -ge "${MIN_NODE_MAJOR}" ]]; then
    NODE_BIN="${candidate}"
    break
  fi
done

if [[ -z "${NODE_BIN}" ]]; then
  echo "No node >= ${MIN_NODE_MAJOR} found. Checked:" >&2
  for candidate in "${CANDIDATES[@]}"; do
    [[ -x "${candidate}" ]] && echo "  ${candidate} -> $(${candidate} --version 2>&1)" >&2
  done
  exit 1
fi

echo "Using ${NODE_BIN} ($(${NODE_BIN} --version))"

# The Keychain ACL is keyed on the binary path, so a different node than the one
# authorised by store-agent-credentials.sh will re-prompt.
NODE_REAL="$(python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]))" "${NODE_BIN}")"
if [[ "${NODE_REAL}" != "${NODE_BIN}" ]]; then
  echo "  (resolves to ${NODE_REAL})"
fi

echo "Building agent..."
(cd "${AGENT_DIR}" && npm ci --silent && npm run build --silent)

# The Reminders provider stays off until this binary exists, so a toolchain that
# is too old is a warning rather than a failure.
if "${AGENT_DIR}/swift-helper/build.sh"; then
  echo "Reminders helper built."
else
  echo "WARNING: reminders-helper did not build; the agent will run Messages only." >&2
fi

mkdir -p "${PLIST_DIR}" "${LOG_DIR}"

sed -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__AGENT_DIR__|${AGENT_DIR}|g" \
    -e "s|__LOG_DIR__|${LOG_DIR}|g" \
    "${REPO_ROOT}/scripts/icloud-bridge/${LABEL}.plist.template" > "${PLIST_PATH}"

echo "Installed ${PLIST_PATH}"

# bootout first so re-running this script reloads a changed plist.
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo
echo "Agent loaded. Useful commands:"
echo "  launchctl print gui/$(id -u)/${LABEL} | head -20"
echo "  tail -f ${LOG_DIR}/agent.log"
echo "  launchctl kickstart -k gui/$(id -u)/${LABEL}   # restart"
echo "  launchctl bootout gui/$(id -u)/${LABEL}        # stop and unload"
