# iCloud Bridge — API Guide for Consumers

Everything a client (dashboard, Shortcut, agent) needs to read and send iMessages
and read and update Reminders.

This documents **verified behaviour of the deployed API**, which differs from
`icloud-bridge-spec.md` in a few places. Where they disagree, this file is right.

---

## 1. Connecting

| | |
| --- | --- |
| Base URL | `https://hukbg70n5b.execute-api.us-west-2.amazonaws.com` |
| Auth | `Authorization: Bearer <api-key>` on **every** request |
| Content type | `application/json` |
| Throttle | 20 req/sec sustained, 40 burst (stage-wide, shared by all clients) |

Get a key:

```bash
scripts/icloud-bridge/show-api-details.sh
```

The secret `icloud-bridge-api-key` holds a JSON object of `name -> key`, so give
the dashboard **its own named key** rather than reusing `default`. Add one by
editing the secret; no redeploy is needed, and the authorizer picks it up within
5 minutes. The key name appears in API access logs, so per-client keys make
traffic attributable.

**Auth failures:** `401` when the `Authorization` header is missing, `403` when
the key is unrecognised or the scheme isn't `Bearer`. Never `200` with an empty
body — it fails closed.

---

## 2. The one thing to understand first: writes are asynchronous

The Mac sits behind NAT, so AWS cannot reach it. A write is **recorded and
queued**, not executed:

```
POST /messages  ->  202 { "commandId": "01M1DHR2MCYDWEDR61D3GN619S" }
```

`202` means *accepted*, **not sent**. To know what happened, poll:

```
GET /commands/01M1DHR2MCYDWEDR61D3GN619S
```

`status` goes `queued` -> `picked_up` -> `done` | `failed`.

In practice this completes in **2–4 seconds**. Poll every ~1s for ~30s, then
treat it as stuck. A UI that shows "sending…" until `done` is the honest design;
one that claims success on the `202` will lie occasionally.

Two things worth knowing:

- **A `failed` command may still succeed on retry.** Failures stay queued and SQS
  redelivers (up to 5 attempts). The first send on a fresh Mac typically fails
  once on a macOS permission prompt, then succeeds. Check `attempts`.
- **`error` is cleared when a retry succeeds**, so `status: "done"` never carries
  a stale error.

Commands expire after **7 days**, after which `GET /commands/{id}` returns `404`.

---

## 3. Messages

### `GET /messages` — recent messages, newest first

| Param | Notes |
| --- | --- |
| `chatId` | Restrict to one conversation (same as the path route below) |
| `sender` | Handle, e.g. `+15551234567`. Use `me` for messages you sent |
| `q` | Case-insensitive text search (see caveat below) |
| `since` | ISO8601; only messages newer than this |
| `limit` | 1–200, default 50 |
| `cursor` | `nextCursor` from a previous response |

```bash
curl -s -H "Authorization: Bearer $KEY" \
  "$URL/messages?limit=20" 
```

```json
{
  "items": [
    {
      "chatId": "iMessage;-;+15551234567",
      "messageGuid": "D744F84A-E94B-47C3-9F60-C3F8C5E7F867",
      "text": "on my way",
      "sender": "+15551234567",
      "isFromMe": false,
      "service": "iMessage",
      "chatName": "Jane",
      "createdAt": "2026-09-01T03:56:00.321Z",
      "dateRead": "2026-09-01T03:57:10.000Z",
      "attachments": [
        { "guid": "...", "name": "IMG_1234.HEIC", "mimeType": "image/heic", "totalBytes": 2314880 }
      ]
    }
  ],
  "nextCursor": "eyJjaGF0SWQiOi..."
}
```

**`q` is a recent-window search, not full-text.** DynamoDB cannot index free
text, so the handler walks up to 10 pages of 200 newest-first and matches in
memory. It returns a `searchedMessages` count so you can tell how deep it looked.
Narrow with `sender` or `since` to search further back, and follow `nextCursor`
to continue. Don't build a "search all history" feature on it.

### `GET /messages/{chatId}` — one conversation

Same as `?chatId=`, returns `{ chatId, items, nextCursor? }`. **URL-encode the
chat GUID** — it contains `;` and `+`:

```bash
curl -s -H "Authorization: Bearer $KEY" \
  "$URL/messages/iMessage%3B-%3B%2B15551234567?limit=50"
```

### `POST /messages` — send

```json
{ "chatGuid": "iMessage;-;+15551234567", "text": "hello" }
```

`chatId` is accepted as an alias for `chatGuid`. Returns `202 { commandId }`.

- `text` is required, max 10,000 chars.
- **Attachments are not supported** — sending one returns `400 UNSUPPORTED`
  rather than silently dropping it.
- Sending to a **new** conversation requires a well-formed chat GUID; the bridge
  cannot create a thread from a bare phone number. Take GUIDs from `GET /messages`.

A sent message also arrives on the read path within a second or two, so a
dashboard that re-polls after `done` will see it without special-casing.

### Message field reference

| Field | Notes |
| --- | --- |
| `chatId` | Chat GUID, `<service>;<type>;<address>`. Stable, use as thread key |
| `messageGuid` | Unique per message. Safe dedup key |
| `text` | Absent for attachment-only messages. Subject is prepended when present |
| `sender` | Absent when `isFromMe` is true |
| `service` | `iMessage`, `SMS`, or **`RCS`** — don't assume two values |
| `dateRead` | Absent if unread |
| `attachments` | Metadata only; **the API serves no file bytes** |
| `reaction` | Present when the message is a **tapback**, not a chat message. See below |
| `replyToGuid` | Set when the message is an inline reply. Common — 57 in a 600-message sample |
| `threadOriginatorGuid` | Head of a longer reply thread |
| `dateDelivered` | Delivery receipt, distinct from `dateRead` |
| `dateEdited` / `dateRetracted` | iOS 16+ edit / "Undo Send" |
| `datePlayed` | Audio message playback |
| `balloonBundleId` | Rich payload: link preview, Apple Pay, app message |
| `expressiveSendStyleId` | Screen/bubble effect |
| `isAudioMessage`, `isSpam` | Present only when true |
| `itemType`, `groupActionType`, `groupTitle` | Present only when non-zero: system events such as a group rename |

### Reactions (tapbacks)

Reactions arrive as **their own messages**, whose `text` is prose like
`Liked "see you then"`. Rendering them as chat lines is almost never what you
want — check `reaction` first and attach it to its target instead:

```json
{
  "messageGuid": "9F2C...",
  "text": "Liked \u201csee you then\u201d",
  "reaction": { "type": "like", "removed": false,
                "targetGuid": "FACA91C9-B157-4C2A-9D04-168CECA2D79D", "targetPart": 0 }
}
```

`type` is `like`, `love`, `laugh`, `emphasize`, `dislike` or `question`.
`removed: true` means the reaction was taken back — apply it as a removal rather
than a second badge. `targetGuid` matches the `messageGuid` of the message being
reacted to; Apple's `p:0/` part prefix is already stripped for you, with the part
index in `targetPart`.

**Retention: 1 year.** Older messages are removed by DynamoDB TTL. Apple remains
the source of truth; this is a queryable cache.

---

## 4. Reminders

### `GET /reminders/lists`

```json
{
  "lists": [
    { "listId": "9B325969-...", "listName": "Reminders", "isDefault": true,
      "sourceName": "iCloud", "isLocal": false, "openCount": 12 },
    { "listId": "3C8C2A71-...", "listName": "Reminders", "isDefault": false,
      "sourceName": "Local", "isLocal": true, "openCount": 0 }
  ]
}
```

`openCount` counts incomplete reminders only.

**Two lists can share a name.** Check `isLocal`: a local ("On My Mac") list
exists only on the Mac and is invisible on iPhone. A dashboard should either hide
local lists or label them, otherwise users see a duplicate and a reminder that
never reaches their phone.

### `GET /reminders`

| Param | Notes |
| --- | --- |
| `listId` | Restrict to one list |
| `completed` | `true` or `false`. Omit for both |
| `dueBefore` | ISO8601; only reminders due before it |
| `dueAfter` | ISO8601; only reminders due after it. Combine with `dueBefore` for a window such as "due today". Undated reminders are excluded from any date window, since they sort after every real date by design |
| `limit` | 1–200, default 50 |
| `cursor` | From `nextCursor` |

Ordering is **by due date ascending, soonest first; undated last**. With no
`completed` filter, open reminders come first, then completed. Paginate with
`nextCursor` — it correctly spans that open/completed boundary.

```json
{
  "items": [
    { "listId": "9B325969-...", "reminderId": "8D65EDAA-...",
      "title": "Buy oat milk", "notes": "oat, not soy",
      "completed": false, "dueDate": "2026-09-03T04:35:13.000Z",
      "priority": 5, "listName": "Reminders",
      "updatedAt": "2026-09-01T04:35:15.000Z" }
  ],
  "nextCursor": "eyJsaXN0SWQiOi..."
}
```

`listId=__lists__` is reserved and returns `400`.

### `POST /reminders`

```json
{ "title": "Buy oat milk", "listId": "9B325969-...", "notes": "oat, not soy",
  "dueDate": "2026-09-03T09:00:00Z", "priority": 5 }
```

Only `title` is required; omit `listId` for the default list. `priority` follows
EventKit: **0 none, 1 high, 5 medium, 9 low**. Returns `202 { commandId }`, and
`result` carries the new `reminderId` and `listId` once `done`.

### `PATCH /reminders/{reminderId}`

```json
{ "completed": true }
{ "title": "New title", "notes": null, "dueDate": "2026-09-05T09:00:00Z" }
{ "listId": "FED2D755-..." }
```

Only fields you send are touched. **`null` clears** `notes`, `dueDate` or
`priority` — omitting a field leaves it alone, which is a different thing.
`listId` moves the reminder between lists. At least one field is required.

### Reminder field reference

| Field | Notes |
| --- | --- |
| `reminderId` | EventKit identifier. Stable, use as the key |
| `listId` | Owning list. **Changes if the reminder is moved** |
| `dueDate` | Absent if undated. Second precision — EventKit drops sub-second |
| `priority` | Absent when unset (EventKit's 0 is normalised away) |
| `completionDate` | Present only when completed |
| `notes` | Absent when empty |
| `recurrence` | Array of rules when the reminder repeats. See below |
| `creationDate` | When the reminder was created |
| `startDate` | Start date, distinct from `dueDate` |
| `url` | Attached URL |

### Recurring reminders

**Each occurrence is a separate reminder with its own `reminderId`.** Reminders
does not model a series as one row that moves: completing an occurrence leaves it
completed forever and the next occurrence exists as a distinct reminder. In this
data `'Garbage, Recycling'` is **80 rows** — 79 completed, weekly since March
2025, and exactly one open.

Two consequences for a dashboard:

- **Grouping by title will collapse a series into one entry** and hide the real
  count. Group by `title` only if that is what you actually want.
- **A "completed today" feed will show recurring chores repeatedly** over time,
  because each completion is a different reminder.

`recurrence` describes the rule on whichever occurrence carries it:

```json
"recurrence": [
  { "frequency": "weekly", "interval": 2, "daysOfTheWeek": ["monday"] }
]
```

| Field | Notes |
| --- | --- |
| `frequency` | `daily`, `weekly`, `monthly`, `yearly` |
| `interval` | Every N periods; `2` + `weekly` is fortnightly |
| `daysOfTheWeek` | `["monday"]`, or `["+1monday"]` / `["-1friday"]` for "first"/"last" |
| `daysOfTheMonth`, `monthsOfTheYear`, `weeksOfTheYear`, `daysOfTheYear`, `setPositions` | Present for the pattern that uses them |
| `endDate` / `occurrenceCount` | Only one is set, and only when the series ends |

Across this library: 19 yearly, 7 quarterly, 5 monthly, 3 semi-annual, 2 weekly,
2 fortnightly. **19 annual series is why the completed-reminder retention window
is 18 months rather than 12** — a 12-month cutoff would sit right on top of them.

### Not available at all

Confirmed absent from the public EventKit API, so no amount of work exposes them:
**subtasks, tags, flagged status, and images attached to reminders.**

**Retention: completed reminders older than 18 months are not mirrored.** Open
reminders are never dropped regardless of age. If a dashboard shows "completed
history", say it covers 18 months.

### No delete

There is no delete endpoint for reminders or messages — the API can create,
update and complete only. Deleting must happen in the Reminders app, and the
change syncs to the mirror normally.

---

## 5. Command status

```
GET /commands/{commandId}
```

```json
{
  "commandId": "01M1DHR2MCYDWEDR61D3GN619S",
  "type": "send_message",
  "status": "done",
  "attempts": 1,
  "payload": { "chatGuid": "iMessage;-;+15551234567", "text": "hello" },
  "result": { "messageGuid": "D744F84A-...", "chatGuid": "...",
              "sentAt": "2026-09-01T03:56:00.321Z" },
  "createdAt": "2026-09-01T03:55:59.502Z",
  "updatedAt": "2026-09-01T03:56:00.817Z"
}
```

`type` is one of `send_message`, `add_reminder`, `complete_reminder`,
`update_reminder`. A `PATCH` that only toggles `completed` becomes
`complete_reminder`; anything richer becomes `update_reminder`.

---

## 6. Pagination

Every list endpoint returns `nextCursor` when more results exist. Treat it as
**opaque** — it encodes DynamoDB internals and its format is not stable. Pass it
back unchanged as `?cursor=`. Absent `nextCursor` means the end.

A page can come back empty while still returning a cursor (search filters and the
open/completed boundary can both do this). **Stop when `nextCursor` is absent,
not when `items` is empty.**

Filtered list queries (`listId` plus `completed` or `dueBefore`) read ahead
internally so `limit` means "up to this many results". Without that, DynamoDB
applies its filter *after* the limit and a list with 38 open reminders answers
with 6. If a request needs more than 10 internal pages it returns `truncated:
true` and omits the cursor; narrow the filter in that case.

---

## 7. Errors

```json
{ "error": { "code": "BAD_REQUEST", "message": "Missing or empty required field: text" } }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Validation failure; `message` names the field |
| 400 | `UNSUPPORTED` | Understood but not implemented (e.g. attachments) |
| 401 | — | Missing `Authorization` header |
| 403 | — | Unrecognised key or wrong scheme |
| 404 | `NOT_FOUND` | Unknown id, or a command past its 7-day TTL |
| 429 | — | Throttled |
| 5xx | `INTERNAL` | Server error; details are in CloudWatch, not the response |

---

## 8. Notes for the dashboard

**Polling.** Reads are cheap DynamoDB queries; a 60s timer is fine. During a
send, poll `GET /commands/{id}` at ~1s until terminal, then re-fetch the thread.
There is no push yet — a WebSocket API is a planned milestone, at which point the
polling loop can be replaced without changing these endpoints.

**Freshness depends on the Mac.** The mirror only updates while the Mac is awake
with the agent running. A stale dashboard usually means a stopped agent, not an
API problem. `AgentHeartbeat` in the `IcloudBridge` CloudWatch namespace is the
liveness signal, and an alarm emails on 10 minutes of silence.

**Cache the chat list.** There is no "list conversations" endpoint. Derive it by
grouping `GET /messages` by `chatId` and keeping the newest per chat; `chatName`
gives a display label where one exists.

**Don't treat the mirror as authoritative.** Apple is the source of truth. Editing
in the Reminders app or Messages will win, and the mirror follows within seconds.

**Timestamps are ISO8601 UTC with milliseconds** and sort lexicographically, so
string comparison is safe.
