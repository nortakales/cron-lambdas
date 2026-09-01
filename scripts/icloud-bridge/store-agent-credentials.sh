#!/usr/bin/env bash
#
# Moves the Mac agent's scoped access key from Secrets Manager into the login
# Keychain, which is the only place the agent reads it from at runtime.
#
# Run once after deploying, and again after rotating the key. Requires AWS
# credentials able to read the agent credentials secret (your deploy identity,
# not the agent's own key).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_JSON="${REPO_ROOT}/src/config/config.json"
KEYCHAIN_SERVICE="icloud-bridge-agent"

read_config() { python3 -c "import json;print(json.load(open('${CONFIG_JSON}'))${1})"; }

REGION="$(read_config "['base']['region']")"
SECRET_NAME="$(read_config "['icloudBridge']['agentCredentialsSecret']")"

echo "Fetching ${SECRET_NAME} from Secrets Manager..."
SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_NAME}" \
  --region "${REGION}" \
  --query SecretString --output text)"

# Validate before storing, so a malformed secret fails here rather than at agent start.
python3 -c "
import json,sys
d=json.loads(sys.argv[1])
assert d.get('accessKeyId') and d.get('secretAccessKey'), 'secret is missing accessKeyId/secretAccessKey'
print('Access key ' + d['accessKeyId'])
" "${SECRET_JSON}"

# The Keychain ACL is checked against the *calling binary*. The agent reads this
# item by shelling out to /usr/bin/security, so that is what has to be trusted --
# authorising the node binary does nothing, because node is never the caller.
#
# This does mean any process running as you that can exec `security` may read the
# item. On a single-user Mac with an unlocked login keychain that is close to the
# status quo anyway; the meaningful win over a plaintext file is that the value is
# encrypted at rest and survives in the keychain rather than in the repo.

# Deleted and recreated rather than updated in place. An item's ACL is fixed at
# creation; updating one that was created with the wrong trusted application
# leaves the bad ACL behind, and the agent then re-prompts on every launchd
# restart. Recreating guarantees the ACL below is the one that takes effect.
security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a aws >/dev/null 2>&1 || true

security add-generic-password \
  -s "${KEYCHAIN_SERVICE}" \
  -a aws \
  -w "${SECRET_JSON}" \
  -T /usr/bin/security

echo "Stored in Keychain under service '${KEYCHAIN_SERVICE}', account 'aws'"
echo
echo "Verify with:"
echo "  security find-generic-password -s ${KEYCHAIN_SERVICE} -a aws -w | python3 -c 'import json,sys;print(json.load(sys.stdin)[\"accessKeyId\"])'"
