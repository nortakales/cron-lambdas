# Plan — Image & Attachment Support

Design for sending and receiving images through the bridge. **Not implemented.**

---

## 1. Why this isn't just "return a URL"

Attachment bytes live on the Mac, in `~/Library/Messages/Attachments`. AWS cannot
reach the Mac — that is the whole premise of the architecture (§4 of the spec:
outbound-only, no inbound to the home network). So the API cannot proxy to
BlueBubbles, and a URL pointing at the Mac is useless to a browser elsewhere.

**Bytes have to be staged in S3, pushed there by the agent.** Everything below
follows from that.

Today `attachments` carries metadata only — `guid`, `name`, `mimeType`,
`totalBytes` — which is enough to render "📎 IMG_1234.HEIC (2.3 MB)" and nothing
more.

---

## 2. Receive path (Mac → S3 → dashboard)

```
BlueBubbles ──webhook──▶ agent ──GET /attachment/:guid/download──▶ bytes
                           │
                           ├── PUT s3://icloud-bridge-attachments/...
                           └── EventBridge (message event now carries s3Key)
                                        │
                                   ingest Lambda ──▶ DynamoDB
                                                        │
                          dashboard ◀── presigned GET URL ── api-read
```

**Eager upload, filtered.** The agent uploads when it first sees the message,
rather than on demand. A lazy fetch would make image display asynchronous —
the dashboard would have to issue a command and poll before rendering a thumbnail,
which is unusable for a gallery.

Filters keep that affordable:

| Rule | Default | Why |
| --- | --- | --- |
| MIME allowlist | `image/*` | Video is the cost blowout; add later if wanted |
| Size cap | 25 MB | Skips live photos and long videos |
| Store a converted rendition | JPEG | See HEIC below |
| Store a thumbnail | ~400px | Gallery views shouldn't pull full-size |

Anything skipped keeps its metadata and gains `attachmentStatus: "skipped"`, so
the dashboard can show a placeholder rather than a broken image.

### HEIC is the trap

Apple photos are HEIC, which **browsers cannot display**. Discovering this after
building the pipeline would mean redoing the storage format.

BlueBubbles solves it for us — its download route accepts `width`, `height`,
`quality` and `original` query parameters and will transcode. So:

- fetch `?original=false` (or explicit `quality`) for a **JPEG rendition**
- fetch `?width=400` for a **thumbnail**

Two objects per attachment, no `sips` shelling, no image library in the agent.
Worth verifying the exact conversion semantics against a real HEIC first — that
is task 1 of implementation, not an assumption to build on.

### Storage layout

```
s3://icloud-bridge-attachments/
  full/<attachmentGuid>.jpg
  thumb/<attachmentGuid>.jpg
```

Attachment GUIDs are unique, so no chat/message nesting is needed, and a flat
prefix keeps the ingest write and the presign both trivial.

---

## 3. Send path (dashboard → S3 → Mac)

```
dashboard ──POST /attachments/upload──▶ 200 { uploadUrl, attachmentKey }
          ──PUT bytes directly to S3──▶ (bypasses API Gateway)
          ──POST /messages { chatGuid, attachmentKey }──▶ 202 { commandId }
                                                              │
                              agent ◀── SQS ── send_attachment command
                                │
                                ├── GET from S3
                                └── POST /api/v1/message/attachment (multipart)
```

**Presigned PUT, not a base64 body.** API Gateway caps a payload at 10 MB and
base64 inflates by 33%, so anything but a small image would fail. A presigned PUT
also keeps image bytes out of Lambda entirely.

Staging objects go under `outbound/` with a **24-hour lifecycle rule**, so a
dashboard that uploads and then abandons the send doesn't accumulate garbage.

**Open question:** whether BlueBubbles' attachment endpoint accepts caption text
in the same call. If not, "image + text" becomes two sends and the command
handler must decide ordering and how to report partial failure. Verify before
designing the command payload.

---

## 4. Changes by component

### AWS (CDK)

- **New private bucket** `icloud-bridge-attachments`.
  **Do not reuse `cron-lambdas-public-bucket`** — it is `publicReadAccess: true`,
  which would publish every image in your message history to the internet.
  - `blockPublicAccess: BLOCK_ALL`, SSE-S3, `enforceSSL`
  - Lifecycle: `full/` and `thumb/` expire at **365 days** to match the message
    TTL, so images never outlive the messages that reference them
  - Lifecycle: `outbound/` expires at 1 day
  - `RemovalPolicy.RETAIN`
- `api-read`: `s3:GetObject` for presigning
- New `api-attachments` Lambda (or a route on `api-write`): `s3:PutObject` for
  presigned uploads
- Agent IAM user: `s3:PutObject` on `full/*` and `thumb/*`, `s3:GetObject` on
  `outbound/*`

### Agent

- `attachment-store.ts` — download from BlueBubbles, upload to S3, with the
  MIME/size filters and a small concurrency limit so a backfill of a hundred
  image messages doesn't saturate the uplink
- `messages/provider.ts` — upload before publishing, so the event carries keys
- New `send_attachment` command handler
- Config: `attachments: { enabled, maxBytes, mimeAllowlist, thumbnailWidth }`

### Data model

`Attachment` gains:

```ts
{
  guid, name, mimeType, totalBytes,      // existing
  s3Key?: string,                        // full rendition
  thumbnailKey?: string,
  status?: 'stored' | 'skipped' | 'failed',
  skipReason?: 'too-large' | 'unsupported-type',
}
```

Ingest stores keys; `api-read` swaps them for presigned URLs on the way out, so
raw keys never leave AWS.

### API

| Endpoint | Change |
| --- | --- |
| `GET /messages`, `GET /messages/{chatId}` | Each attachment gains `url` and `thumbnailUrl` (presigned, ~15 min TTL) |
| `POST /attachments/upload` | **New.** `{ filename, mimeType, sizeBytes }` → `{ uploadUrl, attachmentKey, expiresAt }` |
| `POST /messages` | Accepts `attachmentKey`; stops returning `400 UNSUPPORTED` |

**Presigned URL TTL vs caching** is a real interaction: a dashboard that caches a
message payload for an hour will hold dead URLs. Either keep the TTL longer than
the poll interval, or have the client re-fetch on image error. Decide before the
dashboard caches anything.

---

## 5. Phasing

**Phase A — receive.** Bucket, agent upload with filters, presigned GETs on read.
✅ *Check:* someone texts you a photo; it appears in the dashboard within seconds,
thumbnail and full size, and a HEIC renders in the browser.

**Phase B — send.** Upload endpoint, `send_attachment` command, BlueBubbles
multipart.
✅ *Check:* dashboard uploads a JPEG, `POST /messages` returns `202`, command
reaches `done`, image arrives on the phone and reappears via the read path.

**Phase C — optional.** Backfill existing attachments; video support; blurhash
placeholders (BlueBubbles exposes a `blurhash` endpoint).

Phase A is the one that matters — it unblocks displaying images, which is most of
the value. Phase B is smaller.

---

## 6. Decisions needed before starting

1. **Video?** Default plan is images only. Video is where storage and upload time
   get real, and phone video is frequently 100 MB+.
2. **Backfill?** Only new messages get bytes under this plan. Existing history
   keeps metadata-only attachments unless we walk backwards through it.
3. **Size cap** — 25 MB proposed.
4. **Presigned TTL** — 15 minutes proposed; must exceed the dashboard's cache.

## 7. Risks

- **HEIC conversion** is the highest-risk unknown. Verify BlueBubbles' transcode
  before anything else; if it disappoints, fall back to `sips` on the Mac.
- **Upload bandwidth.** A burst of photo messages has the agent pulling from
  BlueBubbles and pushing to S3 on a home connection. Needs a concurrency limit
  and must never block the webhook path.
- **Retention drift.** If the S3 lifecycle and the DynamoDB TTL disagree, you get
  messages referencing dead keys or orphaned objects paying rent. Same 365 days,
  set in one place.
- **Failure visibility.** An upload that fails must mark the attachment `failed`
  rather than leaving a message that silently claims an image it cannot serve.

## 8. Cost

Negligible at personal volume. A few hundred images a month at ~2 MB is well
under 1 GB/month; S3 storage is ~$0.023/GB/month and requests round to nothing.
Video would change this — a year of phone video could reach tens of GB.
