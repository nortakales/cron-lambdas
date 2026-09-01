# iCloud Bridge — Architecture & Build Spec (Handoff)

> **Purpose of this doc:** a complete, self-contained spec to carry into a Claude Code session **on the Mac**, so no context is lost moving off the web chat. It captures every decision made, the full architecture, the API and queue contracts, the data model, the security/ops model, the repo layout, and a phased build plan with testable checkpoints.

---

## 1. Goals & scope

**Top priority — two-way, both services:**
- **Messages (iMessage/SMS):** read incoming messages *and* send messages.
- **Reminders:** read reminders/lists *and* add new ones + mark complete/update.

**AWS is the integration layer:** stores/syncs data and exposes custom APIs for your own consumers.

**Consumers of the API (confirmed):**
1. Your own apps / a dashboard.
2. Shortcuts / personal automations.
3. LLM agents / automation.

**Designed to be extended.** Messages and Reminders are v1, but the architecture is a **provider model** (§16) so additional Apple/iCloud domains — Calendar, Contacts, iCloud Drive, Mail, Notes, etc. — can be added incrementally without reworking the core. Live push for all domains is a planned milestone (Phase 6), not v1.

**Future, needs a different access path (see §11 and §16):** HomeKit (resident device / Home Assistant), HealthKit (on-device iOS app or Shortcuts export). Not Mac-reachable like the others.

**Assumptions baked in (flag to change):**
- Single-user (your own Apple account); not multi-tenant.
- Sync **all** Reminders lists by default. Consumers filter via the API's `listId` query param and/or client-side. An **optional config denylist** can exclude a specific list from ever being mirrored to AWS (privacy/data-minimization) — off by default.
- Mirror messages into DynamoDB with a **1-year retention window** (`ttl = createdAt + 365 days`, enforced by DynamoDB TTL) plus on-demand backfill via BlueBubbles' REST API. **Apple is always the source of truth**; DynamoDB is a queryable cache.
- AWS infra is **added to the existing `cron-lambdas` CDK app** (CDK v2, TypeScript, npm, ts-node), deployed via its **existing self-mutating CDK Pipeline** — not a new CDK project. See §12 for the full reuse mapping.
- **Node 22 + npm** on the Mac agent (matches the repo's Lambda runtime `NODEJS_22_X`).
- Consumer auth = **static API keys** (BlueBubbles password + any new keys in **Secrets Manager**, following the repo's existing `secretsmanager:GetSecretValue` usage; the repo's `config.json` API-key pattern is the fallback precedent). Swap to Cognito only if you go multi-user.

---

## 2. Ground truths that shaped the design

- **There is no unified "iCloud API."** Each service has a completely different access path.
- **Messages = macOS-only.** No cloud endpoint exists. Data lives in the Messages app's `chat.db`; sending goes through the Messages app via AppleScript. The Mac is mandatory. → We use **BlueBubbles**, a mature macOS server that already parses `chat.db` (including the `attributedBody` blob quirks on modern macOS) and sends via AppleScript, exposing a local REST API + webhooks.
- **Reminders = EventKit on the Mac.** The old CalDAV path is dead (Apple removed it for migrated lists). → A small **Swift helper** wrapping EventKit, driven by the Node agent.
- **HealthKit is unreachable from a Mac** (iPhone/Watch only, no macOS HealthKit, no cloud API). Requires an on-device iOS component later.
- **HomeKit has no cloud API**; it needs a resident device + a different stack (Home Assistant/Homebridge). Separate project.
- **Host hardware:** Intel Mac mini (2018) → **maxes at macOS Sequoia 15**; cannot run Tahoe 26. Security patches ~3 years; plan host migration to Apple Silicon within ~2 years.

---

## 3. Locked decisions

| Area              | Decision                                                                        | Rationale                                                                                              |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Messages stack    | **BlueBubbles** (self-hosted, open source)                                      | Proven; handles chat.db + AppleScript + webhooks; less code to own/maintain across OS updates          |
| Reminders stack   | **Node agent + Swift EventKit helper**                                          | Only supported programmatic path; CalDAV is dead                                                       |
| Connectivity      | **All-AWS, no Cloudflare, no inbound to the Mac**                               | You're AWS-native; avoids new vendor; more secure (nothing at home is exposed)                         |
| Read path         | Mac **pushes** events to AWS via signed SDK calls                               | Mac-initiated outbound only; no public webhook endpoint                                                |
| Write path        | AWS enqueues to **SQS**; Mac **long-polls** and executes locally                | Crosses NAT with zero inbound; near-instant via long polling                                           |
| Write semantics   | **Asynchronous** (`202 + commandId`, then status)                               | Correct pattern for a home-NAT bridge                                                                  |
| Storage           | **DynamoDB** mirror/cache; Apple is source of truth                             | Fast queries for consumers; Apple stays authoritative                                                  |
| IaC               | **Extend the existing `cron-lambdas` CDK v2 app** (deploy via its CDK Pipeline) | No new project to stand up; reuse its constructs (DLQ monitor, error notifier), patterns, and pipeline |
| Consumer auth     | **API keys** in Secrets Manager                                                 | Personal scale; simple                                                                                 |
| Agent auth to AWS | **Scoped IAM user access key in macOS Keychain**                                | Simple; least-privilege (IAM Roles Anywhere is the later hardening path)                               |

---

## 4. Architecture overview

**Principle: the Mac only ever makes outbound connections. The only public endpoint is the consumer API Gateway, protected by API keys. BlueBubbles is never exposed to the internet.**

```
                          ┌──────────────────────────── AWS ────────────────────────────┐
                          │                                                              │
 Consumers                │   ┌───────────────┐     ┌──────────────┐                     │
 (apps / Shortcuts /  ───────▶│ API Gateway   │────▶│ Lambda       │                     │
  LLM agents via MCP)     │   │ (HTTP API)    │     │  - api-read  │──┐                  │
        ▲                 │   │  API-key auth │     │  - api-write │  │                  │
        │                 │   └───────────────┘     │  - cmd-status│  │                  │
        │ reads (JSON)    │                         └──────┬───────┘  │                  │
        │ 202 on writes   │                                │          ▼                  │
        │                 │                          enqueue│      ┌────────────┐         │
        │                 │                                ▼       │ DynamoDB   │◀───┐    │
        │                 │                          ┌──────────┐  │  messages  │    │    │
        │                 │                          │   SQS    │  │  reminders │    │    │
        │                 │                          │ command  │  │  commands  │    │    │
        │                 │                          │  queue   │  │  sync_state│    │    │
        │                 │                          └────┬─────┘  └────────────┘    │    │
        │                 │        ┌── EventBridge/SNS ◀──┘ (fan-out on new events)  │    │
        │                 └────────┼──────────────────────────────────────────────────┘  │
        │                          │                                                       │
        │                 ══════════ Mac (outbound only) ══════════════════════════════   │
        │                          │                                                       │
        │        ┌─────────────────▼───────────────────────────────────────────────┐     │
        │        │  bridge-agent (Node, launchd LaunchAgent)                         │     │
        │        │   • long-polls SQS command queue  ── executes ──▶ local services  │     │
        │        │   • receives BlueBubbles webhook on localhost                     │     │
        │        │   • runs/observes Swift EventKit helper                           │     │
        │        │   • pushes events to AWS via SIGNED SDK calls (IAM) ──────────────┼─────┘
        │        │   • writes command status back to DynamoDB (IAM)                  │
        │        └───────┬───────────────────────────────┬───────────────────────────┘
        │                │ localhost REST                 │ exec / observe
        │        ┌───────▼─────────┐             ┌────────▼──────────┐
        └────────│ BlueBubbles     │             │ reminders-helper  │
   (sent msgs    │ (Messages app,  │             │ (Swift + EventKit)│
    reappear     │  chat.db, no    │             │  Reminders app    │
    via webhook) │  internet)      │             └───────────────────┘
                 └─────────────────┘
```

### Read path (Apple → AWS), event-driven
1. **Messages:** new/updated message → BlueBubbles POSTs a webhook to `localhost` → `bridge-agent` normalizes it → pushes to AWS via **EventBridge `PutEvents`** (SigV4/IAM). A rule writes it to the `messages` table and fans out via SNS.
2. **Reminders:** the Swift helper observes `EKEventStoreChanged`, diffs against last-known state, emits deltas → `bridge-agent` pushes to AWS the same way → `reminders` table + fan-out.

> EventKit has **no change feed** — only a coarse "something changed" notification. The helper computes deltas by diffing. It's effectively real-time but is a diff, not a clean feed like Messages gives us.

### Write path (AWS → Apple), async command queue
1. Consumer calls `POST /messages` (or reminders write) → `api-write` Lambda validates, writes a `commands` row (`status=queued`), enqueues an SQS message, returns **`202 { commandId }`**.
2. `bridge-agent` long-polls SQS (`WaitTimeSeconds=20`), picks up the command (~instant), executes locally:
   - send message → BlueBubbles REST on `localhost`
   - add/complete reminder → Swift helper
3. Agent updates the `commands` row (`status=done|failed`, result/error) via DynamoDB `UpdateItem` (IAM), then deletes the SQS message. Failures → SQS retry → **DLQ** after N attempts.
4. Consumer polls `GET /commands/{id}` for status. For a sent message, the "sent" confirmation *also* naturally arrives on the read path when BlueBubbles reports the outgoing message.

---

## 5. Components

### 5.1 BlueBubbles (Mac, GUI app — you install/configure by hand)
- Install from bluebubbles.app; sign into iMessage; run setup wizard.
- **Bind to localhost only.** Set a strong server password (stored in Secrets Manager and read by the agent).
- Grant **Full Disk Access** (to read `chat.db`) and Automation permission (to send).
- Register a webhook pointing at the agent's local listener (e.g. `http://127.0.0.1:4000/bb-webhook`) for events: `new-message`, `updated-message`, (optional) `typing-indicator`, `updated-message` read receipts.
- *Do not* register any public/tunnel URL — there is none.

### 5.2 reminders-helper (Swift + EventKit, you compile; permission grant is by hand)
A small Swift binary the agent invokes/spawns. Two responsibilities:
- **Observer mode** (long-running): request Reminders access once (interactive TCC prompt), subscribe to `EKEventStoreChanged`, diff, print JSON deltas to stdout.
- **Command mode** (one-shot): `list`, `add`, `complete`, `update` sub-commands returning JSON.

### 5.3 bridge-agent (Node/TypeScript, launchd LaunchAgent)
- Local HTTP listener for BlueBubbles webhooks (`127.0.0.1` only).
- Spawns/manages the Swift helper (observer) and calls it (command mode).
- Long-polls the SQS command queue; dispatches to BlueBubbles REST or the Swift helper.
- Pushes read-path events to AWS (EventBridge `PutEvents`).
- Writes command status back to DynamoDB.
- Holds scoped IAM creds via the macOS Keychain; reads BlueBubbles password from Secrets Manager (or Keychain-cached).
- Checkpoints sync state (message GUID/ROWID cursor, reminder diff snapshot) for restart safety.

### 5.4 AWS (CDK-TS)
- **API Gateway (HTTP API):** consumer routes (API-key auth via a Lambda authorizer or usage-plan key).
- **Lambda:** `api-read`, `api-write`, `cmd-status` (+ optional EventBridge rule targets for writing events to Dynamo and SNS fan-out).
- **SQS:** command queue + DLQ.
- **DynamoDB:** tables per §6.
- **EventBridge + SNS:** ingest bus + fan-out to subscribers (e.g. trigger an agent when a message lands).
- **Secrets Manager:** BlueBubbles password, consumer API keys.
- **IAM:** least-privilege role/policy for the Mac agent's access key.

---

## 6. Data model (DynamoDB)

Multi-table for clarity (all on-demand billing).

**`messages`**
- PK `chatId` (S), SK `ts#messageGuid` (S)
- attrs: `text`, `sender`, `isFromMe` (bool), `service` (iMessage/SMS), `attachments` (list), `createdAt`, `ttl` (epoch = createdAt + 365 days)
- GSI1: PK `isFromMe`, SK `createdAt` (recent activity); GSI2 by `sender` if needed.
- **TTL enabled on `ttl`** → enforces the 1-year retention window (createdAt + 365 days) automatically.

**`reminders`**
- PK `listId` (S), SK `reminderId` (S)
- attrs: `title`, `notes`, `completed` (bool), `dueDate`, `priority`, `listName`, `updatedAt`, `appleLastModified`
- GSI1: PK `completed`, SK `dueDate` (open items by due date).

**`commands`** (write-path status)
- PK `commandId` (S, ULID)
- attrs: `type` (send_message | add_reminder | complete_reminder | update_reminder), `payload`, `status` (queued|picked_up|done|failed), `result`, `error`, `createdAt`, `updatedAt`, `ttl` (e.g. 7 days)

**`sync_state`** (agent checkpoints)
- PK `key` (e.g. `messages_cursor`, `reminders_snapshot`), attrs: `value`, `updatedAt`

---

## 7. Consumer API contract

Base URL: your API Gateway stage. **Auth:** `Authorization: Bearer <api-key>` on every request. All bodies JSON.

### Messages
```
GET  /messages?chatId=&since=&limit=&cursor=
     → 200 { items:[Message], nextCursor? }

GET  /messages/{chatId}?limit=&cursor=
     → 200 { chatId, items:[Message], nextCursor? }

POST /messages
     body: { chatGuid: "iMessage;-;+15551234567", text: "hi", attachments?:[...] }
     → 202 { commandId }          # async send
```

### Reminders
```
GET   /reminders/lists
      → 200 { lists:[{ listId, listName, openCount }] }

GET   /reminders?listId=&completed=&dueBefore=&limit=&cursor=
      → 200 { items:[Reminder], nextCursor? }

POST  /reminders
      body: { listId?, title, notes?, dueDate?, priority? }
      → 202 { commandId }

PATCH /reminders/{reminderId}
      body: { completed?: true, title?, notes?, dueDate?, priority? }
      → 202 { commandId }
```

### Command status (write confirmation)
```
GET /commands/{commandId}
    → 200 { commandId, type, status, result?, error?, createdAt, updatedAt }
```

**Errors:** standard JSON `{ error: { code, message } }`; 401 (bad key), 400 (validation), 404, 429 (throttle), 5xx.

### Consumer notes
- **Dashboard/apps + Shortcuts** use the REST above directly. Shortcuts' *Get Contents of URL* works cleanly with the bearer header. The dashboard polls `GET /messages` / `GET /reminders` on its existing **60s timer** — sufficient for v1. **Live push** (API Gateway WebSocket) for messages *and* reminders is a planned milestone (**Phase 6**); once built, the dashboard can switch from polling to instant updates.
- **LLM agents** get a thin **MCP server** (in-repo) wrapping the same API as tools: `send_message`, `search_messages`, `get_thread`, `list_reminder_lists`, `list_reminders`, `add_reminder`, `complete_reminder`, `update_reminder`, `get_command_status`. Any agent framework can then use the bridge with no bespoke glue.

---

## 8. SQS command contract

Message body the agent consumes:
```json
{
  "commandId": "01J...ULID",
  "type": "send_message | add_reminder | complete_reminder | update_reminder",
  "payload": { /* type-specific, mirrors the POST/PATCH body */ },
  "enqueuedAt": "2026-08-29T00:00:00Z"
}
```
Lifecycle: `queued` → (agent picks up) `picked_up` → `done` | `failed`.
- Agent updates `commands` row and **only then** deletes the SQS message (at-least-once → idempotent by `commandId`).
- Retries via queue redrive; **DLQ** after `maxReceiveCount` (e.g. 5). A CloudWatch alarm on DLQ depth surfaces stuck commands.

---

## 9. Security model

- **No inbound to the home network.** Mac makes only outbound calls (EventBridge, DynamoDB, SQS long-poll, Secrets Manager).
- **BlueBubbles bound to localhost**, never internet-exposed; strong password in Secrets Manager.
- **Only public surface** = consumer API Gateway, API-key authenticated; usage plan + throttling on.
- **Agent IAM = least privilege:** `sqs:ReceiveMessage/DeleteMessage/ChangeMessageVisibility` (command queue), `events:PutEvents` (ingest bus), `dynamodb:UpdateItem`+`GetItem` (commands, sync_state), `secretsmanager:GetSecretValue` (specific secret ARNs). Nothing else.
- Access key stored in **macOS Keychain**, not plaintext files. (Hardening later: IAM Roles Anywhere with a client cert to drop static keys.)
- **No secrets in URLs/query strings** anywhere. Rotate API keys and the BlueBubbles password on a schedule.
- Retention TTL limits how much message content ever sits in AWS.

---

## 10. Reliability & ops (macOS)

- **launchd LaunchAgents** (user session, *not* root LaunchDaemons) for `bridge-agent` and the Swift observer — AppleScript automation requires the logged-in GUI session.
- **Enable auto-login**; **prevent sleep** (`caffeinate` under launchd, or `sudo pmset -a sleep 0 disksleep 0`).
- **TCC permissions to grant by hand (one-time):** Full Disk Access (BlueBubbles), Automation → Messages, Reminders access (Swift helper). **macOS updates can silently reset these** — re-verify after any update.
- **Idempotency/dedup:** message GUID (reads), `commandId` (writes).
- **Checkpoints** in `sync_state` so a restart resumes cleanly; on cold start, backfill recent messages via BlueBubbles REST from the last cursor.
- **Monitoring:** CloudWatch alarms on DLQ depth, agent heartbeat (agent writes a `sync_state` heartbeat every N min; alarm if stale), Lambda errors.
- **This Messages layer is unofficial** and can break on macOS updates; BlueBubbles absorbs most of that, but expect occasional maintenance.

---

## 11. Hardware & OS notes (host longevity)

- Host = **Intel Mac mini 2018** (an Intel "circa 2020" Mini is this model; Mac minis went Apple Silicon from late 2020).
- **Max OS = macOS Sequoia 15.** Cannot run Tahoe 26. Sequoia is the BlueBubbles-recommended/tested version → good to build now.
- Security patches for ~3 years; no new macOS features. **Plan to migrate the bridge host to an Apple Silicon Mac within ~2 years** (the whole stack is portable; only BlueBubbles + permissions need re-setup).
- **Future services:** HealthKit needs an iPhone app or a Shortcuts export → your AWS ingest (the Mac can't see Health data). HomeKit needs Home Assistant/Homebridge + a resident device — a separate build. Neither rides on this host.

---

## 12. Integration into the existing `cron-lambdas` CDK app

The AWS side is **added to your existing `cron-lambdas` repo** (CDK v2, TypeScript, npm, ts-node, esbuild-bundled `NodejsFunction`s, deployed via the self-mutating CDK Pipeline). The genuinely new, non-AWS pieces (Mac agent, Swift helper, MCP server) live as top-level folders in the same repo but are **excluded from the CDK app / esbuild build path** (they run on the Mac, not in Lambda). Split them into a separate repo only if you prefer.

### 12.1 How the app is wired today (so we extend it correctly)
`src/bin/cdk-app.ts` → `CDKPipelineStack` (`pipeline-stack.ts`) → deploys a **Stage** (`deploy-cron-lambda-stage.ts`) → which instantiates **`CronLambdaStack`** (`src/lib/cron-lambda-stack.ts`). That stack news up one construct per feature, each passed the shared `ErrorLogNotifier` lambda so their logs stream to a central notifier. **Deploy = push to `main`; the pipeline self-mutates and deploys.** (For a faster dev loop you can `npx cdk deploy` the stage/stack directly once bootstrapped, bypassing the pipeline.)

### 12.2 Reuse mapping (existing → bridge use)
| Existing asset                                                                                                  | Reused for                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructs/dlq-with-monitor.ts` (`DLQWithMonitor`)                                                             | DLQ + CloudWatch alarm + SNS email for the **SQS command queue** and the **agent heartbeat** alarm — drop-in                                                                                                                             |
| `constructs/error-log-notifier.ts` (`ErrorLogNotifier`)                                                         | Pass `errorLogNotifier.lambda` into the new bridge constructs so their Lambda `ERROR` logs fan out like everything else                                                                                                                  |
| `constructs/dynamodb-access-api.ts` (`DynamoDBAccessAPI`)                                                       | **Precedent** for API-Gateway-over-DynamoDB with an API-key env var. We build a *dedicated, typed, least-privilege* bridge API rather than reusing its `dynamodb:*` on `*` grant, but follow the same `RestApi` + `NodejsFunction` shape |
| `NodejsFunction` + esbuild, `runtime: NODEJS_22_X`, per-feature construct pattern                               | All new bridge Lambdas + the `IcloudBridge*` constructs added to `CronLambdaStack`                                                                                                                                                       |
| `src/config/config.json` (`base.region`, API keys) + `secretsmanager:GetSecretValue`                            | Region + config; put the **BlueBubbles password** and consumer API key in **Secrets Manager** (preferred)                                                                                                                                |
| SES (`@aws-sdk/client-sesv2`) + Pushover (`pushover-notifications`)                                             | Failure/alert notifications (command failed, DLQ, heartbeat stale)                                                                                                                                                                       |
| `@aws-sdk/client-cloudwatch-events`, `client-dynamodb`, `lib-dynamodb`, `client-secrets-manager` (already deps) | EventBridge `PutEvents`, DynamoDB DocClient, Secrets — no new deps needed for these                                                                                                                                                      |
| — (new dependency)                                                                                              | Add **`@aws-sdk/client-sqs`** for enqueue (Lambda) and long-poll (Mac agent)                                                                                                                                                             |

### 12.3 New pieces to add
```
cron-lambdas/                         # your existing repo
├─ src/
│  ├─ lib/
│  │  ├─ cron-lambda-stack.ts         # + new IcloudBridge* construct instantiations
│  │  └─ constructs/
│  │     └─ icloud-bridge-api.ts      # NEW: API GW (read/write/cmd-status) + tables + SQS(+DLQWithMonitor) + EventBridge
│  ├─ lambda/
│  │  └─ icloud-bridge/               # NEW: api-read.ts, api-write.ts, cmd-status.ts, ingest.ts
│  └─ config/config.json              # + bridge region/flags (secrets go to Secrets Manager)
├─ mac-agent/                         # NEW, excluded from CDK/esbuild (runs on the Mac)
│  ├─ src/                            # Node 22 agent: BB webhook listener, SQS poller, AWS push
│  └─ swift-helper/                   # Swift EventKit binary (observer + command modes)
├─ mcp-server/                        # NEW: MCP wrapper over the consumer API (LLM agents)
├─ scripts/                           # NEW: launchd plists, permission checklists
└─ docs/
   └─ icloud-bridge-spec.md           # this file
```
> Keep `mac-agent/`, `swift-helper/`, `mcp-server/` out of `tsconfig`/CDK includes so esbuild never tries to bundle them into a Lambda.

---

## 13. Build plan (phased, each phase has a testable checkpoint)

**Phase 0 — Prereqs (mostly your hands).**
Install BlueBubbles + sign into iMessage; grant Full Disk Access/Automation; install Node 22 + npm + Xcode CLT + AWS CLI; create the scoped IAM user, store key in Keychain. Clone `cron-lambdas`, `npm ci`, add `@aws-sdk/client-sqs`, confirm `npx cdk synth` works (pipeline already bootstrapped).
✅ *Check:* `bb ping` OK locally; `aws sts get-caller-identity` works from the Mac; `cdk synth` succeeds against the existing app.

**Phase 1 — Read path for Messages.**
Add an `IcloudBridgeApi` construct to `CronLambdaStack` (DynamoDB `messages`, EventBridge rule → Dynamo, `api-read` + API Gateway), wired to the shared `ErrorLogNotifier`. Deploy via pipeline (or direct `cdk deploy` in dev). Agent: BB webhook listener → EventBridge push.
✅ *Check:* send yourself an iMessage → it appears via `GET /messages` within seconds.

**Phase 2 — Write path for Messages.**
Extend the construct: SQS command queue with a **`DLQWithMonitor`** DLQ, `commands` table, `api-write`, `cmd-status`. Agent: SQS long-poll → BB REST send → status update.
✅ *Check:* `POST /messages` → `202`; message actually sends; `GET /commands/{id}` → `done`.

**Phase 3 — Reminders both ways.**
Swift helper (observer + commands); grant Reminders permission; `reminders` table; wire read (deltas → EventBridge) and write (SQS → helper).
✅ *Check:* add a reminder on iPhone → shows via `GET /reminders`; `POST /reminders` → appears on iPhone; `PATCH` completes it.

**Phase 4 — Consumers.**
API keys + usage plan; MCP server; a Shortcuts recipe; a minimal dashboard.
✅ *Check:* an LLM agent sends a message + adds a reminder through MCP; a Shortcut hits the API.

**Phase 5 — Hardening.**
launchd plists, caffeinate, heartbeat + DLQ alarms, retention TTL, key rotation, restart/backfill test.
✅ *Check:* reboot the Mac → services auto-resume and backfill; DLQ alarm fires on a forced failure.

**Phase 6 — Live push (WebSocket) — post-v1 milestone.**
Add an API Gateway **WebSocket API**, a `connections` DynamoDB table (connectionId registry), and a broadcaster Lambda subscribed to the existing ingest fan-out (SNS/EventBridge). Any provider that already pushes read events — **messages and reminders** on day one — flows to connected clients with no per-domain work. Auth the WebSocket connect with the same API key. Dashboard switches from 60s polling to live.
✅ *Check:* an incoming iMessage and a reminder change both appear in the dashboard instantly over a live socket; drop/reconnect works.

**Phase 7 — Additional providers (template) — as desired.**
Prove the provider model (§16) by adding the cheapest next domain, **Calendar** (same Swift EventKit helper as Reminders — just events instead of reminders), as a reference implementation: one provider module in the agent, one `IcloudBridgeCalendar` construct, `/calendar` routes, a `calendar` table. Later domains (Contacts, iCloud Drive, Mail, …) follow the same recipe.
✅ *Check:* `GET /calendar` lists events; `POST /calendar` creates one that appears on the iPhone — added without touching Messages/Reminders code.

---

## 14. Decisions resolved & remaining open items

**Resolved:**
- **Messages agent is built fresh** — do *not* inherit the old iMessage node app. (It predates familiarity with the stack; a clean build is expected to be better than what we'd inherit.) The Mac agent's Messages path starts from scratch against BlueBubbles.
- **Same AWS account** as `cron-lambdas` — the bridge deploys into the existing account and `CronLambdaStack`. Namespace all new resources (e.g. `IcloudBridge*` construct IDs, `icloud-bridge-*` queue/table names) to avoid collisions with existing crons.
- **Message retention = 1 year** (`ttl = createdAt + 365 days`, DynamoDB TTL).
- **Reminder lists:** sync **all** by default; consumers filter via `listId` query param and/or client-side; optional config denylist available later to exclude a specific list from AWS entirely (off by default).
- **No live-dashboard WebSocket in v1** — the dashboard's existing 60s polling is sufficient.

**Still open (Claude to verify on the Mac during Phase 0):**
- AWS region — read from `src/config/config.json` (`base.region`).
- macOS version on the Mini (expected Sequoia 15) — confirm once the repo/doc is on the machine.

## 15. Things only you can do (GUI / permission clicks)
Install & configure BlueBubbles (Apple ID sign-in), grant Full Disk Access + Automation + Reminders permissions when prompted, enable auto-login, approve the one-time TCC dialogs. The build will pause and tell you exactly what to click at each point.

---

## 16. Extensibility: the provider model

The whole system is built so a new Apple/iCloud domain is an **additive plug-in**, never a rewrite. Messages and Reminders are just the first two *providers*.

### 16.1 What a "provider" is
Each domain implements the same shape, so the core (queue, ingest bus, API, auth, WebSocket) is reused unchanged:
- **Read source** — how changes leave Apple: a BlueBubbles-style webhook, an EventKit-style change observer, a filesystem watcher, or a poll. The provider normalizes to a common event and hands it to the agent's push path.
- **Write commands** — new `type` values on the existing SQS command envelope (§8). Nothing about the queue changes.
- **Storage** — its own namespaced DynamoDB table (`icloud-bridge-<domain>`), same key conventions.
- **API surface** — `/<domain>` routes following the v1 contract shape: `GET` list/get, `POST`/`PATCH` writes returning `202 { commandId }`.
- **Ingest events** — emitted on the shared EventBridge bus with a per-domain `detail-type`, so fan-out (SNS, and the Phase 6 WebSocket) picks them up for free.

Concretely: the **agent** holds a provider registry (each provider = read-source + command-handlers); **CDK** adds one `IcloudBridge<Domain>` construct per provider; the **API** mounts one route group per provider. Adding a domain touches only that provider's files.

### 16.2 Access-path map for likely future domains
This is what actually shapes each provider (mechanism matters more than the API shape):

| Domain                   | Access path from your setup                                                                                                                                                   | Two-way?             | Effort / notes                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| **Calendar**             | **EventKit** — *same Swift helper as Reminders*, events instead of reminders (or CalDAV, which is alive for calendars)                                                        | Yes                  | **Lowest** — the natural Phase 7 first-add         |
| **Contacts**             | Contacts framework (`CNContactStore`) on macOS, or CardDAV to iCloud (alive)                                                                                                  | Yes                  | Low–moderate                                       |
| **iCloud Drive / files** | Local filesystem at `~/Library/Mobile Documents` (synced by macOS); watch with fsevents                                                                                       | Yes                  | Low, but watch for large files / sync latency      |
| **iCloud Mail**          | IMAP + SMTP with an app-specific password (standard protocols; can run from AWS, no Mac)                                                                                      | Yes                  | Moderate; the one domain that could bypass the Mac |
| **Notes**                | AppleScript to Notes.app on macOS (no public API)                                                                                                                             | Read + limited write | Fragile; rich content is lossy                     |
| **Photos**               | PhotoKit (`PHPhotoLibrary`) on macOS                                                                                                                                          | Read + add           | Heavy (large media); scope carefully               |
| **HomeKit**              | No cloud API — needs the HomeKit framework on a resident-capable Apple device, or Home Assistant/Homebridge (you already run a SwitchBot API integration, a useful precedent) | Yes (via that stack) | Separate stack, not this agent                     |
| **HealthKit**            | **iPhone/Watch only** — no macOS access; requires an on-device iOS app with a HealthKit entitlement, or a Shortcuts automation pushing to your AWS ingest                     | Push out only        | Off-Mac; different component entirely              |

### 16.3 Design implications already baked into v1
- Command `type` and the SQS envelope are **domain-agnostic** — new domains add types, not plumbing.
- Tables and API routes are **namespaced per domain** from the start.
- The ingest bus + fan-out are **generic**, so Phase 6's WebSocket serves every future provider automatically.
- EventKit covers **both** Reminders and Calendar, so the Swift helper is written as a general EventKit bridge, not a reminders-only tool — Calendar is nearly free once Reminders works.