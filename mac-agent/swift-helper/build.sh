#!/usr/bin/env bash
#
# Builds and ad-hoc signs the reminders-helper binary.
#
# The Info.plist is linked into the binary's __TEXT,__info_plist section: a plain
# command-line tool has no bundle, and without those usage-description strings
# macOS kills the process instead of showing a Reminders permission prompt.
#
# Requires an up-to-date Command Line Tools install — `requestFullAccessToReminders`
# is a macOS 14 API and is absent from older SDKs.

set -euo pipefail

HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${HELPER_DIR}/out"
BINARY="${OUT_DIR}/reminders-helper"

SDK_VERSION="$(xcrun --show-sdk-version)"
if [[ "${SDK_VERSION%%.*}" -lt 14 ]]; then
  echo "macOS SDK ${SDK_VERSION} is too old; this needs 14 or newer." >&2
  echo "Update with: sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

swiftc -O \
  -o "${BINARY}" \
  "${HELPER_DIR}/RemindersHelper.swift" \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker "${HELPER_DIR}/Info.plist"

# TCC keys its grant on the code signature. Ad-hoc signing gives a stable
# identifier, but the signature still changes whenever the binary is rebuilt, so
# expect to re-approve the Reminders prompt after a rebuild.
codesign --force --sign - \
  --identifier com.nortakales.icloud-bridge.reminders-helper \
  "${BINARY}"

echo "Built ${BINARY}"
codesign -dv "${BINARY}" 2>&1 | head -3
