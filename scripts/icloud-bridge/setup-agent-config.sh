#!/usr/bin/env bash
#
# Generates ~/.icloud-bridge/agent.json from the deployed stack.
#
# Everything is resolved by looking resources up in AWS by name rather than by
# reading CloudFormation outputs, so renaming a CDK construct cannot break it.
# No secrets are written here: AWS credentials live in the Keychain and the
# BlueBubbles password is fetched from Secrets Manager at runtime.
#
# Usage: scripts/icloud-bridge/setup-agent-config.sh [--webhook-port 4000]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_JSON="${REPO_ROOT}/src/config/config.json"
OUT_DIR="${HOME}/.icloud-bridge"
OUT_FILE="${OUT_DIR}/agent.json"
WEBHOOK_PORT=4000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --webhook-port) WEBHOOK_PORT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

read_config() { python3 -c "import json;print(json.load(open('${CONFIG_JSON}'))${1})"; }

REGION="$(read_config "['base']['region']")"
EVENT_BUS="$(read_config "['icloudBridge']['eventBusName']")"
QUEUE_NAME="$(read_config "['icloudBridge']['commandQueueName']")"
COMMANDS_TABLE="$(read_config "['icloudBridge']['commandsTableName']")"
SYNC_STATE_TABLE="$(read_config "['icloudBridge']['syncStateTableName']")"
METRIC_NAMESPACE="$(read_config "['icloudBridge']['metricNamespace']")"
BB_SECRET="$(read_config "['icloudBridge']['blueBubblesPasswordSecret']")"

echo "Resolving command queue URL for ${QUEUE_NAME} in ${REGION}..."
QUEUE_URL="$(aws sqs get-queue-url --queue-name "${QUEUE_NAME}" --region "${REGION}" --output text --query QueueUrl)"

mkdir -p "${OUT_DIR}"
chmod 700 "${OUT_DIR}"

cat > "${OUT_FILE}" <<JSON
{
  "region": "${REGION}",
  "eventBusName": "${EVENT_BUS}",
  "commandQueueUrl": "${QUEUE_URL}",
  "commandsTableName": "${COMMANDS_TABLE}",
  "syncStateTableName": "${SYNC_STATE_TABLE}",
  "metricNamespace": "${METRIC_NAMESPACE}",
  "blueBubbles": {
    "url": "http://127.0.0.1:1234",
    "passwordSecret": "${BB_SECRET}"
  },
  "webhook": {
    "host": "127.0.0.1",
    "port": ${WEBHOOK_PORT}
  },
  "reminders": {
    "helperPath": "${REPO_ROOT}/mac-agent/swift-helper/out/reminders-helper"
  },
  "keychainService": "icloud-bridge-agent"
}
JSON

chmod 600 "${OUT_FILE}"
echo "Wrote ${OUT_FILE}"
