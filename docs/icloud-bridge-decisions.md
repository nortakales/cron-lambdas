# Decisions & Invariants

Why the bridge is built the way it is, what was rejected, and which
odd-looking code is load-bearing.

The other docs say *what* and *how*. This one says *why*, so a later change
doesn't undo a deliberate choice — or reintroduce a bug that took real time to
find.

---

## Part 1 — Decisions

### HTTP API instead of the repo's usual RestApi

Every other API in `cron-lambdas` uses `apigateway.RestApi`. The bridge uses
`apigatewayv2.HttpApi`: ~70% cheaper per request, and its Lambda authorizer
speaks `Authorization: Bearer` natively where REST usage-plan keys would force
`x-api-key`.

**Given up:** usage plans, so no *per-key* throttling. Throttling is stage-wide
(20 rps / 40 burst, shared by all consumers). If one client ever needs isolating,
that is the reason to revisit.

### Consumer keys are a JSON map, not one string

`icloud-bridge-api-key` holds `{ "default": "...", "dashboard": "..." }`. Adding
a consumer is a secret edit, no redeploy, live within 5 minutes. The matched key
name lands in access logs, so traffic is attributable, and one consumer can be
revoked without disturbing others.

**Consequence:** a new key 403s for up to 5 minutes while the authorizer's cache
expires. That is not a bug; wait rather than debug.

### CDK owns the agent's IAM credential

CDK creates the IAM user, its least-privilege policy, and the access key, then
stores the key in Secrets Manager. `store-agent-credentials.sh` moves it into the
login Keychain. Fully reproducible, key material never in git.

**Rejected:** creating the key by hand in the console — not reproducible, and the
policy would drift from the code that depends on it.

### The reminders diff runs in Node, not Swift

The spec had the Swift helper compute deltas. It emits a full snapshot instead
and the agent diffs it.

Diffing needs the *previous* state. In Swift that state would have to live on the
Mac and the helper would need its own persistence and AWS access. Keeping the
helper stateless — "report what EventKit currently holds", "apply this one
mutation" — means all durable state stays in one place and the helper stays a
component that is trivial to reason about and re-run by hand.

### The reminders checkpoint is a local file, not DynamoDB

The fingerprint map is ~90 bytes per reminder. At 6,695 reminders that is ~580KB,
past DynamoDB's hard **400KB item limit**. It lives at
`~/.icloud-bridge/reminders-snapshot.json` (~88KB after retention filtering); a
small summary still goes to `sync_state` for AWS-side visibility.

**Rejected — compression:** UUID-heavy data compresses ~2:1, landing near 300KB.
Too close to a hard limit that fails catastrophically.
**Rejected — sharding across items:** works, but multiplies writes per snapshot
and adds cross-item consistency concerns for no real gain.

**The failure mode is why this matters.** When the write fails, the provider
rediscovers every reminder as "changed" on every EventKit notification and
republishes the entire library — forever. It is silent unless you are watching
event volume.

**Accepted cost:** losing the file costs one full resync, which is harmless
because ingest is an idempotent upsert.

### Retention filtering happens in the agent, before the diff

Completed reminders older than 548 days are dropped in the provider, not expired
by a DynamoDB TTL.

**Why not TTL:** TTL would delete the row while the fingerprint map still claimed
it was published. The agent would never re-publish it and the mirror would be
permanently, silently wrong. Filtering before the diff means an aged-out reminder
simply stops appearing in `current`, so it is emitted as an ordinary deletion and
the mirror stays consistent.

**Why 548 days:** 19 of this library's recurring reminders are *annual*. The most
recent completed occurrence of a yearly series is up to ~12 months old, so a
365-day cutoff would sit directly on top of them. 18 months leaves ~6 months of
margin.

### Ingest events carry arrays

A cold-start backfill of hundreds of messages costs a handful of `PutEvents`
calls instead of hundreds of Lambda invocations. The agent chunks to stay under
EventBridge's limits; the ingest Lambda always reads a list.

### Both log streams go to one file

The launchd plist points `StandardOutPath` and `StandardErrorPath` at the same
`agent.log`.

A fatal DynamoDB error sat in `agent.error.log` for several minutes while
`agent.log` looked healthy and I was grepping the wrong file. One chronological
stream keeps an error next to the lines that explain it. The very next bug —
EventBridge rejecting oversized requests — was visible immediately.

### Providers start independently and retry

A provider whose local dependency is down must not take the agent with it.
Originally a missing BlueBubbles killed the process, taking the heartbeat and
Reminders with it — which also made "agent dead" and "BlueBubbles restarting"
indistinguishable from AWS. Each provider now starts on its own with backoff, so
the heartbeat keeps reporting and the distinction is visible.

---

## Part 2 — Invariants

Load-bearing behaviour that looks like it could be simplified. Each of these was
a real bug. **Do not "clean up" without reading the reason.**

### Keychain

- **ACL must trust `/usr/bin/security`, not `node`.** The agent shells out to
  `security`, and the ACL is checked against the *calling binary*. Trusting node
  does nothing — node is never the caller.
- **The item is deleted and recreated, never updated with `-U`.** An item's ACL
  is fixed at creation; updating one created with the wrong ACL leaves the bad
  ACL in place and the agent re-prompts on every restart no matter what you click.
- Keychain *values* cannot be read outside the logged-in GUI session —
  `security -w` exits 0 with empty output. The agent detects this explicitly.
  Run it under launchd, not from a detached shell.

### `install-launch-agent.sh` must verify the Node major version

`command -v node` resolved to nvm's v24 in one shell and a 2021 Homebrew v16 in
another. v16 has no global `fetch` and no `AbortSignal.timeout`, so the agent
fails in non-obvious ways. The script probes candidates, requires **>= 22**, and
prints what it chose. Re-run it after any nvm version change — the plist holds an
absolute path.

### EventBridge limits the whole request, not just each entry

`PutEvents` caps **both** an individual entry and the **total request** at 256KB.
Batching items into entries is not sufficient; entries must then be grouped so no
single call exceeds the total. This passed by luck until a 6,695-reminder publish,
and PutEvents reports it as an unmodelled `UnknownError`.

### Filtered DynamoDB queries must read ahead

`FilterExpression` is applied **after** `Limit`. A list with 38 open reminders
answered with 6. Filtered reminder queries page internally until `limit` is
satisfied, and report `truncated: true` rather than silently dropping rows.

### Never pass an unused ExpressionAttributeValue

DynamoDB rejects the whole request. `:latestDated` is supplied only for the
open-ended `dueAfter` case, because the `dueAfter`+`dueBefore` branch does not
reference it.

### `NO_DUE_DATE_SORT` is a sentinel, and date windows must exclude it

Undated reminders sort at `9999-12-31T23:59:59.999Z` so they come last. A
`dueAfter` query therefore needs an upper bound (`LATEST_DATED_SORT`, one tick
below) or every undated reminder matches "due after any date".

### The fingerprint must include every field the mirror stores

A field that is stored but not fingerprinted never propagates after its first
publish — edit it in Reminders and the mirror keeps the stale value forever.
`recurrence`, `startDate` and `url` are in the hash for this reason. **Add a
field to `toReminderInput`, add it to `fingerprint`.**

### Checkpoints are written only after a successful publish

Both providers. Writing first would silently drop anything that failed to
publish; writing after means the next snapshot retries it.

### `flush()` rethrows, so fire-and-forget callers must `.catch`

The coalescing timer and the size-cap path both call it without awaiting. An
unhandled rejection there takes the process down. Buffered messages are put back
before the throw, so the next flush retries them.

### Command status clears `error` on success

A command that failed once and succeeded on redelivery would otherwise report
`done` alongside a stale error, which reads like a failure to anyone polling.

### Reminders.app must be running

EventKit reads the *local* store, which macOS only syncs from iCloud while
Reminders.app is open. With it closed, a reminder added on the phone never
arrives and the observer correctly reports "no changes" — there genuinely are
none locally. The provider launches it hidden at start-up. Exactly analogous to
BlueBubbles needing Messages.app.

### Attachments must never be written to the public bucket

`cron-lambdas-public-bucket` has `publicReadAccess: true` and public-access blocks
disabled. Putting message attachments there would publish the message history to
the internet. Attachment work uses a **new private bucket**.

---

## Part 3 — Choices the user made

- **Commit and deploy straight to `main`.** The repo's workflow is push-to-main
  deploys, so a feature branch would leave deployed reality and `main` diverged.
- **Cloudflare tunnel enabled** so the BlueBubbles phone client works away from
  home. This means the spec's §9 claim "BlueBubbles is never exposed to the
  internet" **is no longer true on this host**. The bridge is unaffected — the
  agent still talks only to loopback and AWS still never connects inward — but the
  BlueBubbles password is now an internet-facing credential.
- **"All Events" webhooks** rather than just message events. Harmless: unhandled
  types are logged once each, and receipt bursts are coalesced.
- **Completed-reminder retention of 18 months**, chosen for annual-recurrence
  safety margin.
