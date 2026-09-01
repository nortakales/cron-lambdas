#!/usr/bin/env bash
#
# Prints what you need to call the bridge API by hand: the base URL, a consumer
# API key, and the BlueBubbles server password to paste into BlueBubbles' setup.
#
# Everything it prints is a secret. Don't paste the output anywhere shared.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_JSON="${REPO_ROOT}/src/config/config.json"

read_config() { python3 -c "import json;print(json.load(open('${CONFIG_JSON}'))${1})"; }

REGION="$(read_config "['base']['region']")"
API_KEY_SECRET="$(read_config "['icloudBridge']['apiKeySecret']")"
BB_SECRET="$(read_config "['icloudBridge']['blueBubblesPasswordSecret']")"

API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" \
  --query "Items[?Name=='icloud-bridge-api'].ApiId | [0]" --output text)"

if [[ "${API_ID}" == "None" || -z "${API_ID}" ]]; then
  echo "No API named 'icloud-bridge-api' found in ${REGION}. Deploy first." >&2
  exit 1
fi

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"

API_KEY="$(aws secretsmanager get-secret-value --secret-id "${API_KEY_SECRET}" \
  --region "${REGION}" --query SecretString --output text \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["default"])')"

BB_PASSWORD="$(aws secretsmanager get-secret-value --secret-id "${BB_SECRET}" \
  --region "${REGION}" --query SecretString --output text)"

cat <<OUT
API base URL        ${API_URL}
API key (default)   ${API_KEY}
BlueBubbles password ${BB_PASSWORD}

Try it:
  curl -s -H "Authorization: Bearer ${API_KEY}" "${API_URL}/messages?limit=5" | python3 -m json.tool

Export for a shell session:
  export BRIDGE_URL="${API_URL}"
  export BRIDGE_KEY="${API_KEY}"
OUT
