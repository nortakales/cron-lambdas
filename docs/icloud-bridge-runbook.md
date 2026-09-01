# iCloud Bridge — Runbook

Operational companion to `icloud-bridge-spec.md`: how to deploy it, how to run it,
and where the implementation deliberately departs from the spec.

## What exists

| Path | What it is |
| --- | --- |
| `src/lib/constructs/icloud-bridge/` | CDK: `bridge-core` (tables, bus, queue, secrets, agent IAM), `bridge-ingest` (EventBridge rule → Lambda), `bridge-api` (HTTP API + authorizer), `icloud-bridge` (composer) |
| `src/lambda/icloud-bridge/` | `authorizer`, `api-read`, `api-write`, `cmd-status`, `ingest`, plus `shared/` (model, ddb, http, log) |
| `mac-agent/` | Node agent: SQS poller, EventBridge publisher, providers for Messages and Reminders |
| `mac-agent/swift-helper/` | Swift EventKit binary (`observe` and `exec` modes) |
| `mcp-server/` | MCP wrapper over the consumer API (9 tools) |
| `scripts/icloud-bridge/` | Config generation, Keychain loading, launchd install, credential display |

## Order of operations

### 1. Deploy AWS

```
aws configure                 # us-west-2; needs deploy rights
npx cdk deploy CronLambdasCDKPipelineStack/DeployCronLambdaStage/CronLambdaStack
```

Deploying directly is the fast dev loop. The durable path is `git push` to `main`,
which the existing self-mutating pipeline picks up — push once the shape settles,
or the pipeline will revert a locally-deployed change.

Confirm the SNS subscription emails (DLQ monitors, heartbeat alarm) that arrive
after the first deploy; alarms are silent until you do.

### 2. Configure BlueBubbles

```
scripts/icloud-bridge/show-api-details.sh    # prints the generated BlueBubbles password
```

Install BlueBubbles, sign into iMessage, and set that password as the server
password. Then:

- Bind to **localhost only**; register no public or tunnel URL.
- Grant **Full Disk Access** (to read `chat.db`) and **Automation → Messages**.
- Add a webhook to `http://127.0.0.1:4000/bb-webhook` for `new-message` and
  `updated-message`.

### 3. Set up the agent

```
scripts/icloud-bridge/setup-agent-config.sh        # writes ~/.icloud-bridge/agent.json
scripts/icloud-bridge/store-agent-credentials.sh   # Secrets Manager -> login Keychain
scripts/icloud-bridge/install-launch-agent.sh      # build + launchd
```

`install-launch-agent.sh` also builds the Swift helper. If the toolchain is too
old it warns and continues, and the agent runs Messages only — the Reminders
provider enables itself once `mac-agent/swift-helper/out/reminders-helper` exists.

### 4. Verify

```
eval "$(scripts/icloud-bridge/show-api-details.sh | sed -n 's/^  export /export /p')"
curl -s -H "Authorization: Bearer $BRIDGE_KEY" "$BRIDGE_URL/messages?limit=5" | python3 -m json.tool
tail -f ~/Library/Logs/icloud-bridge/agent.log
```

## Host prerequisites

- **macOS 15 Sequoia** on the Intel Mac mini. Enable auto-login and prevent sleep
  (`sudo pmset -a sleep 0 disksleep 0`) — a sleeping Mac stops the bridge and
  trips the heartbeat alarm.
- **Command Line Tools for Xcode 16+.** The Reminders helper calls
  `requestFullAccessToReminders`, a macOS 14 API absent from older SDKs. If
  `xcrun --show-sdk-version` reports below 14:
  ```
  sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install
  ```
- **TCC permissions reset on macOS updates.** Re-check Full Disk Access,
  Automation → Messages, and Reminders after every update.

## Deviations from the spec, and why

| Spec | Built | Why |
| --- | --- | --- |
| "BlueBubbles is never exposed to the internet" (§4, §9) | **No longer true on this host** | A Cloudflare tunnel is enabled so the BlueBubbles phone client works away from home. The bridge itself is unaffected — the agent still talks only to `127.0.0.1`, and AWS still never connects inward — but the Mac now has an internet-reachable service guarded solely by the BlueBubbles password. Treat that password as an internet-facing credential. |
| `messages` GSI1 on `isFromMe` | `timeline-index` on a constant `timelineKey` | A two-value partition key is a worse version of the same query. A constant key makes `GET /messages` (no chatId) one descending query, which the API contract actually needs. `isFromMe` is still queryable via `sender-index` with `sender=me`. |
| `sync_state` PK `key` | PK `stateKey` | `KEY` is a DynamoDB reserved word; renaming avoids aliasing it in every expression. |
| Swift helper diffs reminders | Helper emits full snapshots; the agent diffs | Diffing needs the previous state, which lives in DynamoDB. Diffing in Node keeps the Swift binary stateless and the checkpoint durable across restarts. The stored checkpoint is a fingerprint map (hash + listId per reminder), not reminder content. |
| "No secrets in URLs anywhere" | BlueBubbles password is a query parameter | BlueBubbles' auth middleware reads the password **only** from the query string; it has no header form. Confined to loopback. The public API is unaffected and uses `Authorization: Bearer`. |
| REST API precedent in this repo | HTTP API | ~70% cheaper per request, and its Lambda authorizer speaks Bearer natively. Trade-off: no per-key usage plans, so throttling is set at the stage (20 rps / 40 burst). |
| Table names `icloud-bridge-<domain>` | `icloud_bridge_<domain>` | Matches the snake_case convention of every existing table in this account. |
| `attachments` on `POST /messages` | Rejected with 400 `UNSUPPORTED` | Sending attachments needs a separate upload path; failing loudly beats accepting and silently dropping. |

## Gotchas that cost real time

These were all found during the first live bring-up, and none are in the spec.

**The Keychain ACL trusts the *calling binary*, which is `/usr/bin/security`.**
The agent reads its credential by shelling out to `security`, so authorising the
`node` binary with `-T` does nothing — node is never the caller. Worse, an item's
ACL is fixed at creation: updating in place with `-U` leaves the original ACL,
so the agent re-prompts on every launchd restart no matter what you click.
`store-agent-credentials.sh` therefore deletes and recreates the item.

**Both log streams go to one file, deliberately.**
The plist points `StandardOutPath` and `StandardErrorPath` at the same
`agent.log`. A fatal DynamoDB error sat in `agent.error.log` for several minutes
while `agent.log` looked perfectly healthy. One chronological stream keeps errors
next to the lines that explain them.

**Claude Code / detached shells cannot read Keychain values at all.**
`security find-generic-password -w` exits 0 with *empty output* outside the
logged-in GUI session. The agent detects this and says so explicitly rather than
reporting a missing item. Run the agent under launchd, not from a detached shell.

**Check which `node` launchd actually got.**
`command -v node` resolved to nvm's v24 in one shell and a 2021 Homebrew v16
symlink in another. v16 has no global `fetch` and no `AbortSignal.timeout`, so
the agent fails in non-obvious ways. `install-launch-agent.sh` now probes
candidates, requires major version >= 22, and prints the version it chose.
Re-run it after any nvm version change, since the plist holds an absolute path.

**The first send always fails.** Driving Messages over AppleScript triggers a
one-time Automation TCC prompt. Until it is answered the AppleScript blocks, the
60s client timeout fires, and the command is marked `failed` — then SQS
redelivers and attempt 2 succeeds in under a second. This is working as intended;
just click Allow when it appears, and expect one failed attempt on a fresh host
or after a macOS update resets TCC.

**Reminders.app must be running, or iCloud never syncs to the Mac.**
EventKit reads the *local* Reminders store, and macOS only pulls it from iCloud
while Reminders.app is open. With it closed, a reminder added on the phone simply
never arrives and the observer correctly reports "no changes" — there genuinely
are none locally. Opening the app made 6,695 reminders appear at once. The
provider now launches it hidden (`open -j -g -a Reminders`) at start-up. This is
the exact analogue of BlueBubbles needing Messages.app.

**The reminders checkpoint lives on disk, not in DynamoDB.**
The fingerprint map is ~90 bytes per reminder, so a real library (6,695 here)
produces ~580KB — past DynamoDB's hard 400KB item limit. The failure mode is
nasty: the checkpoint write fails, so every EventKit notification and every
restart rediscovers the entire library as "changed" and republishes it forever.
The map now lives at `~/.icloud-bridge/reminders-snapshot.json` (674KB) with only
a small summary in `sync_state`. Losing that file costs one harmless full
resync, because ingest is an idempotent upsert.

**EventBridge limits the whole PutEvents request to 256KB, not just each entry.**
Batching items into entries is not sufficient; the entries must then be grouped
so no single call exceeds the total. This only surfaced at ~6,700 reminders —
smaller batches had stayed under the limit by luck — and PutEvents reports it as
an unmodelled `UnknownError`, so the publisher now attaches the entry count and
byte size to the message.

**"All Events" webhooks are chatty.** Every delivery and read receipt fires
`updated-message`, which initially produced 8 ingest events for 2 messages. The
agent now coalesces webhook activity over a 400ms window, keyed by message GUID,
so a receipt burst becomes one event carrying the final state.

## Reminder retention

Completed reminders older than **548 days (18 months)** are not mirrored
(`reminders.completedRetentionDays` in `~/.icloud-bridge/agent.json`; 0 disables).
This cut a 6,695-reminder library to 874 and the local checkpoint from 674KB to
88KB.

- **Only completed reminders age out.** An open reminder is still actionable
  however old it is, and is never dropped.
- **18 months is deliberate margin for annual recurrences.** The most recent
  completed occurrence of a yearly reminder is at most ~12 months old, so a
  live recurrence series can never be truncated.
- **A completed reminder with no completion date is kept**, since its age is
  unknown and dropping it would be a guess.
- Filtering happens in the agent, before the diff, so a reminder that ages out
  appears as a normal deletion and the mirror stays consistent. Doing this with
  a DynamoDB TTL instead would delete the row while the fingerprint map still
  claimed it was published, and the mirror would never heal.
- Changing the window takes effect on the next snapshot: widening it republishes
  the newly-included reminders, narrowing it deletes the newly-excluded ones —
  **provided the checkpoint is left in place.** Deleting
  `~/.icloud-bridge/reminders-snapshot.json` first skips the deletions and
  orphans those rows in DynamoDB.

## Local vs iCloud lists

`GET /reminders/lists` reports `sourceName` ("iCloud", "Local") and `isLocal`.

A **local list** exists only on this Mac and is invisible on iPhone. One shows up
here as a second list also called "Reminders": before iCloud finished its first
sync, EventKit's default list for new reminders was that local one, so anything
created in that window landed in a list no other device can see. Worth checking
`isLocal` before wondering where a reminder went.

## Things worth knowing

- **Ingest events carry arrays.** A cold-start backfill of hundreds of messages
  costs a handful of `PutEvents` calls, not hundreds of Lambda invocations.
- **Writes are asynchronous end to end.** `202 { commandId }`, then poll
  `GET /commands/{commandId}`. A failed command stays on SQS for redrive unless it
  is a `PermanentCommandError`, which is deleted immediately rather than burning
  five deliveries en route to the DLQ.
- **Everything is idempotent.** Reads key on the Apple identifier (message GUID,
  EventKit item id); writes key on `commandId`. Replaying either is safe.
- **The Reminders TCC grant attaches to `node`**, not to the helper binary, since
  Node spawns it. Expect "node" in System Settings → Privacy & Security →
  Reminders. Rebuilding the helper changes its ad-hoc signature and may re-prompt.
- **Message retention is one year**, enforced by DynamoDB TTL. Commands expire
  after seven days.
