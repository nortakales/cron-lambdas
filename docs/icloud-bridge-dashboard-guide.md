# Dashboard Implementation Guide

Requirement-by-requirement mapping for the personal dashboard. Full endpoint
reference is in `icloud-bridge-api.md`; this is the short path to a working UI.

```
BASE = https://hukbg70n5b.execute-api.us-west-2.amazonaws.com
AUTH = Authorization: Bearer <api-key>
```

Give the dashboard **its own named key** rather than reusing `default` — add one
to the `icloud-bridge-api-key` secret (a JSON `name -> key` map) and it is live
within 5 minutes, no redeploy. The key name shows up in access logs.

---

## Status of what you asked for

| Requirement | Status |
| --- | --- |
| View all messages | Ready |
| Send new messages | Ready |
| Reactions — **display** | Ready |
| Reactions — **send** | **Not possible today.** Needs BlueBubbles' Private API, which is off on this Mac |
| Images — send / receive | **Not built.** Attachment *metadata* only, no bytes |
| Reminders: non-completed only | Ready |
| Reminders: recurrence info | Ready |
| Reminders: per list | Ready |
| Reminders: due today | Ready |
| Reminders: add | Ready |
| Reminders: complete | Ready |

---

## The one pattern to get right: writes are asynchronous

Sending a message and adding/completing a reminder all return `202` with a
`commandId`. **That means queued, not done.** The Mac is behind NAT; the agent
picks the command up over SQS and executes it locally.

```js
const { commandId } = await post('/messages', { chatGuid, text });

// Typically resolves in 2-4s.
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const cmd = await get(`/commands/${commandId}`);
  if (cmd.status === 'done')   return cmd.result;
  if (cmd.status === 'failed') throw new Error(cmd.error);
}
```

Show "sending…" until `done`. A UI that treats `202` as success will lie
occasionally. Note `failed` is not always terminal — failures stay queued and
SQS redelivers up to 5 times, so check `attempts` before showing a hard error.

---

## Messages

> **`createdAt` is the send time, not the ingest time.** Any message — sent by
> the user *or* received from someone else — can reach the mirror after its
> timestamp, arriving in a burst when BlueBubbles resumes reporting. Stalls of
> up to an hour have been measured and there is no automated fix yet, so do not
> design as though ingest order matches `createdAt`.
>
> So a message can appear "in the past": polling `?since=<last seen createdAt>`
> **can miss it**, because it was written with a timestamp earlier than one you
> already processed. If you poll incrementally, re-query a trailing window
> (~15 min) rather than advancing `since` to the newest `createdAt` you saw.
> Cause and analysis: `icloud-bridge-runbook.md`, gotchas.

### View all messages

```
GET /messages?limit=50
```

Newest first, across every conversation. Follow `nextCursor` for older.

### Conversation list

There is no "list chats" endpoint. Derive it — group a page of `/messages` by
`chatId` and keep the newest per chat:

```js
const chats = new Map();
for (const m of (await get('/messages?limit=200')).items) {
  if (!chats.has(m.chatId)) chats.set(m.chatId, { chatId: m.chatId, name: m.chatName, latest: m });
}
```

### One thread

```
GET /messages/{chatId}?limit=50
```

**URL-encode `chatId`** — it contains `;` and `+`:
`iMessage%3B-%3B%2B15551234567`.

### Send

```
POST /messages
{ "chatGuid": "iMessage;-;+15551234567", "text": "hello" }
```

`202 { commandId }`, then poll. The sent message also appears on the read path
within a second or two, so re-fetching the thread after `done` picks it up.

Sending needs a **well-formed chat GUID** — take it from `GET /messages`. The
bridge cannot start a new conversation from a bare phone number.

### Reactions

Reactions arrive as **their own messages** whose `text` is prose like
`Liked "see you then"`. Rendering them as chat lines is wrong. Filter them out of
the transcript and attach them to their target:

```js
const byGuid = new Map(items.map(m => [m.messageGuid, m]));
const bubbles = [];

for (const m of items) {
  if (!m.reaction) { bubbles.push(m); continue; }
  const target = byGuid.get(m.reaction.targetGuid);
  if (!target) continue;                       // target may be off the current page
  target.reactions ??= [];
  if (m.reaction.removed) {
    target.reactions = target.reactions.filter(r => r.type !== m.reaction.type);
  } else {
    target.reactions.push({ type: m.reaction.type, from: m.sender ?? 'me' });
  }
}
```

`type` is `like`, `love`, `laugh`, `emphasize`, `dislike`, `question`.
`targetGuid` joins directly against `messageGuid` — Apple's `p:0/` prefix is
already stripped. **`removed: true` means the tapback was taken back**, so apply
it as a removal, not a second badge.

Reactions can target a message older than your current page. Either ignore
unmatched ones (as above) or fetch the target by paging back.

### Images and attachments

`attachments` gives you **metadata only** — `guid`, `name`, `mimeType`,
`totalBytes`. There is no URL and the API serves no bytes, so you can show
"📎 IMG_1234.HEIC (2.3 MB)" but not the picture.

This is a genuine gap, not an oversight. The files live on the Mac, which AWS
cannot reach, so serving them needs the agent to upload attachments to S3 and the
API to hand back presigned URLs. Sending images needs the reverse. Neither is
built.

### Other fields worth using

`replyToGuid` (inline replies — common), `dateDelivered` vs `dateRead`,
`dateEdited`, `dateRetracted` (show as "Unsent"), `balloonBundleId` (rich payload
such as a link preview), `service` — which is `iMessage`, `SMS`, **or `RCS`**.

---

## Reminders

### Open reminders only

```
GET /reminders?completed=false&limit=200
```

Sorted by due date, soonest first, **undated last**. In this library that is 67
open, 19 of them undated.

### Due today

```
GET /reminders?completed=false&dueAfter=<today 00:00Z>&dueBefore=<tomorrow 00:00Z>
```

For the more useful **"today + overdue"** view, drop `dueAfter`:

```
GET /reminders?completed=false&dueBefore=<tomorrow 00:00Z>
```

Undated reminders are excluded from both — they sort after every real date by
design, so a date window never sweeps them in. Query them separately if the
dashboard needs a "no due date" bucket.

Both bounds are ISO8601 UTC. Build them from the user's local midnight, not UTC
midnight, or the view drifts by the timezone offset.

### Per list

```
GET /reminders/lists
GET /reminders?listId=<id>&completed=false&limit=200
```

`GET /reminders/lists` gives `openCount` per list for badges.

**Filter out `isLocal: true` lists**, or at least label them. A local
("On My Mac") list is invisible on iPhone, and this account has one that shares
the name "Reminders" with the real iCloud list — showing both looks like a bug.

`limit` means "up to this many results" even with filters applied; the handler
reads ahead internally. If a response carries `truncated: true`, narrow the filter.

### Recurrence

```json
"recurrence": [{ "frequency": "weekly", "interval": 2, "daysOfTheWeek": ["monday"] }]
```

```js
const label = r => {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.frequency];
  const every = r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${unit}s`;
  return r.daysOfTheWeek?.length ? `${every} on ${r.daysOfTheWeek.join(', ')}` : every;
};
```

`daysOfTheWeek` may carry an ordinal prefix — `"+1monday"` is "first Monday",
`"-1friday"` is "last Friday". `endDate` or `occurrenceCount` appear only when
the series ends.

**Each occurrence is a separate reminder with its own `reminderId`.** Completing
one leaves it completed forever; the next occurrence is a different reminder that
already exists. `'Garbage, Recycling'` is 80 rows — 79 completed, one open.

Two consequences:

- **Do not group by title** to build a task list; you will collapse a series and
  hide the real state.
- A "completed today" feed will show the same recurring chore repeatedly over
  time, because each completion is a distinct reminder.

Since you only show non-completed items, you get exactly one row per series,
which is what you want.

### Add

```
POST /reminders
{ "title": "Buy oat milk", "listId": "<id>", "dueDate": "2026-09-03T09:00:00Z", "priority": 5 }
```

Only `title` is required; omit `listId` for the default list. Priority is
EventKit's scale: **0 none, 1 high, 5 medium, 9 low**. `202 { commandId }`, and
`result` carries the new `reminderId` once `done`.

### Complete

```
PATCH /reminders/{reminderId}
{ "completed": true }
```

`202 { commandId }`. Send `{"completed": false}` to reopen.

For optimistic UI: mark it done locally, poll the command, and roll back on
`failed`. The mirror catches up within a second or two of `done`.

Other `PATCH` fields: `title`, `notes`, `dueDate`, `priority`, `listId` (moves
lists). Only what you send is touched, and **`null` clears** a field — different
from omitting it.

### Not available

**Subtasks, tags, flagged status and reminder images.** No public EventKit API
exposes them, so no amount of work on this side surfaces them.

---

## Practical notes

**Polling.** A 60s timer for reads is fine. During a write, poll
`/commands/{id}` at ~1s until terminal. No push yet; a WebSocket API is a planned
milestone and will not change these endpoints.

**Freshness depends on the Mac.** The mirror only updates while the Mac is awake
with the agent running. A stale dashboard usually means a stopped agent, not an
API fault.

**Pagination.** Stop when `nextCursor` is **absent**, not when `items` is empty —
a page can legitimately come back empty with more behind it. Treat the cursor as
opaque.

**Retention.** Messages 1 year, completed reminders 18 months, command records 7
days. Open reminders are never aged out.

**Errors** are `{ "error": { "code", "message" } }`. 401 = no header, 403 = bad
key, 400 = validation (the message names the field), 404 = unknown id or expired
command, 429 = throttled (20 rps sustained, 40 burst, shared by all clients).

**Timestamps** are ISO8601 UTC with milliseconds and sort lexicographically, so
string comparison is safe.
