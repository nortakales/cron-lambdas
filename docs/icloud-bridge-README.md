# iCloud Bridge

Two-way bridge between Apple's Messages and Reminders on a Mac mini and an HTTP
API in AWS. Reads flow Mac → EventBridge → DynamoDB → API; writes flow API → SQS
→ Mac agent. **The Mac never accepts an inbound connection.**

Status: **Messages and Reminders live in both directions.**

---

## Which document

| I want to… | Read |
| --- | --- |
| Build a client against the API | `icloud-bridge-dashboard-guide.md`, then `icloud-bridge-api.md` |
| Full endpoint reference | `icloud-bridge-api.md` |
| Install, run, or fix the thing | `icloud-bridge-runbook.md` |
| Understand *why* it's built this way | `icloud-bridge-decisions.md` |
| Change the code without breaking it | `icloud-bridge-decisions.md` — **Part 2, Invariants** |
| Know what's missing or next | `icloud-bridge-backlog.md` |
| Add image support | `icloud-bridge-attachments-plan.md` |
| The original design | `icloud-bridge-spec.md` |
| Get iMessage into Beeper on Windows | `beeper-imessage-bridge.md` — **separate project**, shares only the BlueBubbles server |

**Changing agent or Lambda code? Read Part 2 of the decisions doc first.** It
lists behaviour that looks redundant but is load-bearing — every entry was a real
bug that took real time to find.

---

## Quick reference

| | |
| --- | --- |
| API | `https://hukbg70n5b.execute-api.us-west-2.amazonaws.com` |
| Account / region | `787068200846` / `us-west-2` |
| Auth | `Authorization: Bearer <key>` from secret `icloud-bridge-api-key` (JSON `name -> key`) |
| Tables | `icloud_bridge_messages`, `_reminders`, `_commands`, `_sync_state` |
| Bus / queue | `icloud-bridge-bus` / `icloud-bridge-command-queue` |
| Secrets | `icloud-bridge-api-key`, `-bluebubbles-password`, `-agent-credentials` |
| Agent identity | IAM user `icloud-bridge-agent`; key in Keychain `icloud-bridge-agent` / `aws` |
| launchd | `gui/501/com.nortakales.icloud-bridge-agent` |
| Agent log | `~/Library/Logs/icloud-bridge/agent.log` (stdout **and** stderr) |
| Agent config | `~/.icloud-bridge/agent.json` |
| Reminders checkpoint | `~/.icloud-bridge/reminders-snapshot.json` |
| BlueBubbles | `http://127.0.0.1:1234`, webhook → `http://127.0.0.1:4000/bb-webhook` |
| Monitoring | CloudWatch `IcloudBridge/AgentHeartbeat`; alarms `IcloudBridgeAgentHeartbeatAlarm`, `IcloudBridgeCommand-DLQ-Monitor`, `IcloudBridgeIngest-DLQ-Monitor` |

### Common commands

```bash
# Is it alive?
launchctl print gui/$(id -u)/com.nortakales.icloud-bridge-agent | grep state
tail -f ~/Library/Logs/icloud-bridge/agent.log

# Restart / stop
launchctl kickstart -k gui/$(id -u)/com.nortakales.icloud-bridge-agent
launchctl bootout   gui/$(id -u)/com.nortakales.icloud-bridge-agent

# Rebuild and reinstall after a code change
scripts/icloud-bridge/install-launch-agent.sh

# Messages stalled in BOTH the mirror and Beeper? Ask BlueBubbles what it saw.
# Detection lag should be ~1s; more means App Nap is throttling it (see runbook).
defaults read com.BlueBubbles.BlueBubbles-Server NSAppSleepDisabled   # want 1

# Credentials and URLs
scripts/icloud-bridge/show-api-details.sh

# Deploy AWS (fast loop; push to main for the durable path)
npx cdk deploy CronLambdasCDKPipelineStack/DeployCronLambdaStage/CronLambdaStack
```

### Retention

Messages 1 year · completed reminders 18 months · command records 7 days · open
reminders never expire.

### First things to check when something looks wrong

1. **Is the agent running?** Most "stale data" is a stopped agent, not an API fault.
2. **Is Reminders.app running?** If not, iCloud stops syncing to the Mac and
   reminders silently stop updating.
3. **Messages stale but agent healthy?** BlueBubbles has stopped reporting new
   messages — it stalls Beeper identically. Usually App Nap throttling its poll:
   `defaults read com.BlueBubbles.BlueBubbles-Server NSAppSleepDisabled` (want
   1). Confirm with `GET /api/v1/server/logs`. See the runbook gotchas.
   Also check BlueBubbles is even running — it does not start at login.
4. **Grep the agent log for `ERROR`.** Both streams land in one file.
5. **New API key not working?** The authorizer caches for 5 minutes. Wait.
