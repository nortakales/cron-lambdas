# Backlog

Everything known to be missing, blocked, or worth doing later. Rough sizes are
relative to the phases already built (Messages read+write was about a day).

---

## Next up

### Attachments / images — planned, not started
`icloud-bridge-attachments-plan.md`. Phase A (receive) is the valuable half:
it unblocks displaying images in the dashboard. Phase B (send) is smaller.
**Size:** Phase A ≈ one phase. Verify BlueBubbles' HEIC→JPEG transcode first —
that assumption is load-bearing for the storage format.

### Send reactions — blocked on the Mac, not on code
BlueBubbles' `react` route sits behind `PrivateApiMiddleware`, and this server
reports `private_api: False`. Requires installing the BlueBubbles Private API
helper (it patches Messages). Once enabled, the endpoint and command type are
small. *Reading* reactions already works.
**Size:** small, once unblocked.

---

## API gaps the dashboard will feel

### A real conversation-list endpoint
There is no "list chats". Clients group `GET /messages` by `chatId` and keep the
newest per chat, which means over-fetching and missing any chat older than the
page. A `GET /chats` backed by a per-chat "latest message" projection would be
better. **Size:** small–moderate; needs a new item shape or GSI.

### Delete
No delete for messages or reminders — create, update and complete only. Deleting
happens in the Apple apps and syncs back. Worth adding `DELETE /reminders/{id}`
at least; EventKit supports it directly. **Size:** small.

### Search is a recent-window scan
`?q=` walks up to 10 pages newest-first and matches in memory. Fine for "find
that message from last week", useless for "search all history". Real full-text
means OpenSearch or DynamoDB-with-an-index-table. **Size:** moderate–large;
probably not worth it at personal scale.

### Group chat participants
`chatName` is captured but not the participant list, so a group thread cannot
show who is in it. BlueBubbles returns participants when asked
(`with: ["chat.participants"]`). **Size:** small.

### Backfill window is 7 days
A first run — or a restart after a long outage — reaches back 7 days only, capped
at 25 pages. Older history is never mirrored. A one-off deeper backfill would
populate the archive. **Size:** small (config + a manual run).

---

## Planned milestones from the spec

### Phase 6 — live push (WebSocket)
API Gateway WebSocket API, a `connections` table, and a broadcaster subscribed to
the existing SNS fan-out. The fan-out topic already exists and carries every
provider's events, so this serves messages *and* reminders with no per-domain
work. Dashboard swaps 60s polling for instant updates. **Size:** one phase.

### Phase 7 — Calendar provider
The cheapest next domain: same EventKit helper, events instead of reminders. The
Swift helper was written as a general EventKit bridge for this reason. Proves the
provider model. **Size:** less than a phase.

### Further domains
Contacts (`CNContactStore`), iCloud Drive (fsevents on `~/Library/Mobile
Documents`), Mail (IMAP — the one domain that could bypass the Mac entirely),
Notes (AppleScript, fragile), Photos (PhotoKit, heavy). See spec §16.2.

---

## Hardening

### Key rotation is untested
Both the consumer API keys and the agent's IAM access key. The mechanics exist
(edit the secret; re-run `store-agent-credentials.sh`) but neither has been
exercised. **Do this before relying on it in an emergency.**

### IAM Roles Anywhere
Spec §9's stated hardening path: replaces the agent's static access key with a
client certificate. Removes the long-lived credential entirely. **Size:**
moderate.

### BlueBubbles password
`Nortak1!` is 8 characters and internet-facing via the Cloudflare tunnel. It
guards full read/write access to the entire message history and the ability to
send as you. Change it in BlueBubbles, then:
```
aws secretsmanager put-secret-value --secret-id icloud-bridge-bluebubbles-password --secret-string '<new>'
```

### Host migration
Intel Mac mini 2018 maxes out at macOS Sequoia 15 (spec §11). Security patches
for ~3 years. The stack is portable; only BlueBubbles and the TCC grants need
re-doing. Plan for Apple Silicon within ~2 years.

---

## Loose ends

- **Local "On My Mac → Reminders" list** still exists and is invisible on iPhone.
  Delete it in Reminders.app — but note two lists share the name "Reminders", and
  the iCloud one has real content. The sidebar groups by account.
- **MCP server is built and unused.** 9 tools, smoke-tested over stdio, never
  pointed at a client. Needs `BRIDGE_URL` and `BRIDGE_KEY`.
- **No Shortcuts recipe** (spec Phase 4). The API works with *Get Contents of URL*
  and a bearer header.
- **Two prod Lambda assets ping-pong.** `NewComicsCron` and `ProductTrackerCron`
  use `bundling.nodeModules`, so CDK runs `npm install` inside the bundle and
  CodeBuild and macOS produce different hashes for identical source. Local
  `cdk deploy` and pipeline deploys will each show the other's as drift forever.
  Pre-existing, harmless, but it makes `cdk diff` permanently noisy. Fixing means
  dropping `nodeModules` in favour of plain esbuild bundling.

---

## Won't fix — no API exists

- **Reminders subtasks, tags, flagged status, attached images.** Confirmed absent
  from the public EventKit headers. No amount of work exposes them.
- **Typing indicators** are ephemeral webhook events, never stored.
- **HealthKit** is iPhone/Watch only — needs an on-device app or a Shortcuts
  export (spec §16.2).
- **HomeKit** has no cloud API; needs a resident device and a separate stack.
