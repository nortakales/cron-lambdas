# Beeper ⇄ BlueBubbles iMessage Bridge

Puts iMessage into **Beeper Desktop on Windows**, so there is one chat UI there
instead of two (Beeper for everything else, BlueBubbles client for iMessage).

It does this by adding a **second consumer** to the BlueBubbles server that is
already running on the Mac mini for the iCloud Bridge. **The iCloud Bridge is not
modified and not affected.**

Status: **partially set up — blocked on `bbctl login`.** See *Progress* at the end.

> Not part of the iCloud Bridge. It only shares that project's BlueBubbles server
> and host. Nothing here touches AWS, the agent, or the tables.

---

## Architecture

```
                    ┌─ webhook :4000 ──→ mac-agent ──→ EventBridge ──→ AWS   (unchanged)
BlueBubbles :1234 ──┤
   (Mac mini)       └─ socket.io ws ───→ mautrix-imessage ──→ Beeper Matrix ──→ Beeper Desktop
                                          (new, run by bbctl)                    (Windows)
```

Only the lower branch is new.

**The two consumers cannot collide.** The mac-agent is *pushed to* over an HTTP
webhook at `127.0.0.1:4000/bb-webhook`. The Beeper bridge *pulls* over a
socket.io websocket it opens itself. Different transports, different directions.
BlueBubbles is built to serve many clients at once — this is the same thing the
phone and desktop clients do.

Verified in the connector source (`imessage/bluebubbles/api.go`):

```go
ws, _, err := websocket.DefaultDialer.Dial(bb.wsUrl(), nil)
ws.WriteMessage(websocket.TextMessage, []byte("40"))   // socket.io CONNECT
...
q.Add("password", bb.bridge.GetConnectorConfig().BlueBubblesPassword)
```

`wsUrl()` is just `bluebubbles_url` with `http` swapped for `ws`, so pointing it
at `http://127.0.0.1:1234` keeps the bridge **entirely on loopback**. It does not
use, need, or widen the Cloudflare tunnel, and it opens no inbound port.

---

## Which bridge, and why

`bbctl` offers two iMessage bridge types. We use the first.

| Type | Repo | Verdict |
| --- | --- | --- |
| `imessage` | [mautrix/imessage](https://github.com/mautrix/imessage) | **Chosen.** Active (last push 2026-05-14). Has a BlueBubbles connector, so it reuses the server already here. |
| `imessagego` | [beeper/imessage](https://github.com/beeper/imessage) | **Rejected.** GitHub repo *archived* since 2024-04; mau.dev mirror dead since 2024-01. |

Community threads recommend `imessagego`, or a Rust rewrite called **corten**,
on the grounds that they need no always-on Mac. Both were rejected:

- **The premise doesn't apply.** Their advantage is not needing a Mac. This host
  is an always-on Mac mini with auto-login and sleep disabled — that requirement
  is already paid for.
- **`imessagego` spoofs registration data**, which is the exact behaviour Apple
  banned accounts for in 2023–24. The BlueBubbles path is a real Mac running
  Messages.app normally — the same thing this host already does, with no new
  exposure. It is not a new risk surface; it is the existing one.
- **corten** ([ajkessel/corten-matrix](https://github.com/ajkessel/corten-matrix))
  is actively committed to but had **0 stars** when evaluated. Unvetted.

**Known weakness of the chosen path:** the `imessage/bluebubbles/` connector
subdirectory has not been touched since **2024-06**. The parent bridge is
maintained; the connector is effectively feature-frozen. Accepted — it works, and
the alternative is worse.

---

## Prerequisites

| | |
| --- | --- |
| Host | The Mac mini. Must be always-on — the bridge dies with it. |
| BlueBubbles | Already installed and running on `127.0.0.1:1234`. |
| Beeper account | Free. Self-hosted bridges **do not count against account limits**. |
| `bbctl` | `brew install beeper/tap/bbctl` |
| `ffmpeg` | `brew install ffmpeg` — media conversion |
| Go toolchain | **Not needed.** See *CI builds amd64* below. |

---

## Setup

### 1. Verify BlueBubbles before touching anything

```bash
BB_PW="$(aws secretsmanager get-secret-value --secret-id icloud-bridge-bluebubbles-password \
  --region us-west-2 --query SecretString --output text)"

# Server reachable, and what features it has
curl -s "http://127.0.0.1:1234/api/v1/server/info?password=${BB_PW}" | python3 -m json.tool

# The transport the bridge will actually use — this is the one that matters
curl -s "http://127.0.0.1:1234/socket.io/?password=${BB_PW}&EIO=4&transport=polling"
```

The socket.io call must return `0{"sid":"…","upgrades":["websocket"],…}`. If that
works, the bridge's connection path is proven before anything is installed.

### 2. Install

```bash
brew install beeper/tap/bbctl
brew install ffmpeg
```

### 3. Log in — interactive, must be a real terminal

```bash
bbctl login
```

Prompts for the Beeper email, then a code mailed to it. **This cannot be
automated or driven through a tool session**; run it in a terminal on the mini.
Confirm with `bbctl whoami`.

### 4. Run the bridge, in the foreground first

```bash
bbctl run --type imessage \
  --param 'imessage_platform=bluebubbles' \
  --param "bluebubbles_url=http://127.0.0.1:1234" \
  --param "bluebubbles_password=${BB_PW}" \
  sh-imessage
```

The bridge name must start with `sh-`.

**Expect this to fail the first time.** The run downloads the bridge binary
(~54 MB) and then aborts with `dyld: Library not loaded: …libolm.3.dylib`. That
is normal and the download is not wasted — apply the **libolm symlink** from
*Gotchas* below, then re-run the exact same command. The second run starts
cleanly.

A healthy startup logs `component=bluebubbles` lines such as
`INF queryChatMessages component=bluebubbles`, then `Inserted new portal …` for
each chat.

Errors reading `No contacts matched address` / `Failed to get contact info` are
**benign** — they are numbers not in the Mac's address book (shortcodes and the
like). Those puppets simply get no display name.

### 5. Verify the generated config actually took the params

```bash
grep -A3 bluebubbles ~/.local/share/bbctl/sh-imessage/config.yaml
```

**Do not skip this.** Upstream warns `bbctl run` sometimes fails to copy
`--param` values into `config.yaml`, and it is the single most commonly reported
failure for this bridge. Fix by editing the file directly.

Then send a message each way between iMessage and Beeper.

### 6. Put it under launchd

Template: `scripts/beeper-bridge/com.nortakales.beeper-imessage-bridge.plist.template`.

`bbctl` has **no service mode** — upstream says it "currently runs in the
foreground" — so launchd supervises it exactly like the mac-agent: restart on
non-zero exit, `ThrottleInterval` 30, and stdout+stderr into one log file.

### 7. Cut over

Run Beeper and the BlueBubbles Windows client side by side for a few days, then
retire the BlueBubbles client.

---

## Operating it

```bash
# Alive?
launchctl print gui/$(id -u)/com.nortakales.beeper-imessage-bridge | grep -E "state|pid"
tail -f ~/Library/Logs/beeper-bridge/beeper-bridge.log

# Restart / stop
launchctl kickstart -k gui/$(id -u)/com.nortakales.beeper-imessage-bridge
launchctl bootout   gui/$(id -u)/com.nortakales.beeper-imessage-bridge

# Install after editing the template
sed -e "s|__BBCTL_DIR__|$HOME|g" -e "s|__LOG_DIR__|$HOME/Library/Logs/beeper-bridge|g" \
  scripts/beeper-bridge/com.nortakales.beeper-imessage-bridge.plist.template \
  > ~/Library/LaunchAgents/com.nortakales.beeper-imessage-bridge.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nortakales.beeper-imessage-bridge.plist
```

| | |
| --- | --- |
| launchd | `gui/501/com.nortakales.beeper-imessage-bridge` |
| Log | `~/Library/Logs/beeper-bridge/beeper-bridge.log` (stdout **and** stderr) |
| Config | `~/Library/Application Support/bbctl/prod/sh-imessage/config.yaml` |
| Binaries | `~/Library/Application Support/bbctl/prod/binaries/` |
| Beeper token | `~/.config/bbctl.json` |
| Beeper account | `@nortakales:beeper.com` |

**Only ever run one instance.** The launchd job and a manual `bbctl run` would
share one SQLite database and one appservice registration. Always `bootout`
before running by hand.

## Reset

If the bridge misbehaves, start clean rather than debugging a half-state:

```bash
bbctl delete sh-imessage
rm -rf ~/.local/share/bbctl/sh-imessage
```

Then redo step 4.

---

## Gotchas

**Messages you send from your iPhone appear late. This is not a bridge bug.**
*(cost the entire first debugging session; affects the iCloud Bridge identically)*

On this **idle, headless Mac**, BlueBubbles only notices `chat.db` changes when
something wakes Messages.app — and what wakes it is an **APNs push, which only
arrives when the Mac is a recipient**.

| Traffic | Push to Mac? | Latency |
| --- | --- | --- |
| From other people | yes | real time |
| Sent from Beeper / this Mac | n/a — originates locally | real time |
| **Sent from your iPhone** | **no** — you are the sender | **stalls until the next wake** |

Each wake **flushes the whole backlog at once**, so a single inbound message can
release messages that have been stuck for minutes. Observed: group messages
stalled 12m16s and 3m17s, both released the instant an inbound message landed.
The very newest message can also miss the scan cursor by microseconds and arrive
on the *next* wake — a self-sent test produced its two copies 34 seconds apart.

**Why it was never noticed in the iCloud Bridge:** in a live conversation,
replies arrive constantly and each one flushes your own messages behind it. Only
an isolated message to a quiet chat exposes the lag.

Debugging notes, so the next person skips the wrong turns:

- **It is not group-vs-1:1.** That correlation is a coincidence of which messages
  get tested. The variable is whether the Mac is a *recipient*.
- **App Nap is not the cause.** `defaults write com.apple.iChat
  NSAppSleepDisabled -bool YES` plus a Messages.app restart changed nothing. The
  setting is harmless and was left in place.
- **`Ignoring duplicate message` in the log is a red herring** — correct dedupe
  of old messages BlueBubbles re-sends as status updates. Check the `message`
  table in the bridge DB before theorising.
- **Diagnose with three sources, not one:** BlueBubbles `POST /api/v1/message/query`
  is ground truth for what the Mac has; the bridge log and `~/Library/Logs/icloud-bridge/agent.log`
  show what each consumer received. If *both* consumers missed it, the fault is
  upstream of both and is not a Beeper problem.

Mitigations, ranked:

1. **Accept it.** Inbound is real time, and sending *from* Beeper is real time —
   verified. The lagging case is one where you already saw the message on the
   device you sent it from.
2. **Check the BlueBubbles UI** for a new-message poll interval. Not exposed via
   the API (`server/config` and `server/settings` both 404).
3. **Private API** — the true fix, and still not recommended: requires SIP
   disabled, and [#843](https://github.com/BlueBubblesApp/bluebubbles-server/issues/843)
   reports it can kill the `chat.db` watcher outright.

Related upstream: [#750 — inbound messages delayed after Mac inactivity](https://github.com/BlueBubblesApp/bluebubbles-server/issues/750).

**The bridge will not start until `libolm` is symlinked into place.** *(hit on
first run; cost the only real debugging of the setup)*

`bbctl` downloads `libolm.3.dylib` next to the bridge binary, but the binary is
linked against Homebrew's **absolute** path, so dyld never looks in the bundled
location and the process aborts:

```
dyld: Library not loaded: /usr/local/opt/libolm/lib/libolm.3.dylib
Bridge exited  signal: abort trap
```

`brew install libolm` **cannot fix this** — the formula was removed from
Homebrew after matrix.org deprecated libolm in favour of vodozemac. Point the
expected path at the copy bbctl already downloaded:

```bash
mkdir -p /usr/local/opt/libolm/lib
ln -sfn "$HOME/Library/Application Support/bbctl/prod/binaries/libolm.3.dylib" \
        /usr/local/opt/libolm/lib/libolm.3.dylib
```

The bundled dylib is a universal binary (x86_64 + arm64), so this is correct on
either architecture. **Symlink, don't copy** — bbctl replaces that file when it
updates the bridge, and a symlink keeps following it. `/usr/local/opt` is
group-writable by `admin`, so no `sudo`. Verify with
`"$HOME/Library/Application Support/bbctl/prod/binaries/mautrix-imessage" --version`.

**`--no-override-config` is load-bearing in the plist.**
`bbctl run` regenerates `config.yaml` on every start by default. Combined with
the upstream bug where `--param` values don't always copy, a launchd restart can
silently replace a hand-verified config with a broken one. The plist pins the
config; the flag is not cosmetic.

**Tapbacks will not send, and this is not fixable here.**
The server reports `private_api: False`. Sending reactions needs BlueBubbles'
Private API, which needs **SIP disabled**. This is the same limitation already
recorded in `icloud-bridge-backlog.md` — Beeper inherits it rather than adding
it. Reading reactions works. Disabling SIP on the machine holding the iMessage
identity is not recommended.

**CI builds amd64, so no Go toolchain is needed.**
This host is Intel (`x86_64`), and `bbctl` has a `--compile` flag for
architectures CI doesn't build — which would drag in Go. Checked: mautrix/imessage
pipeline 20935 has both `build amd64` and `build universal`. `--compile` is not
needed. Re-check if that ever changes, since the failure mode is a confusing
download error rather than a clear message.

**The BlueBubbles password lands in `config.yaml` in plaintext.**
It is in `~/.local/share/bbctl/sh-imessage/`, user-readable. The mac-agent gets
the same secret from the Keychain instead. Accepted because the file is in the
user's home on a single-user host, but it is a second copy of an
internet-facing credential — rotate both together.

**Messages transit Beeper's servers.**
End-to-end encrypted, but a third party is now in the path. This is a real
departure from the iCloud Bridge, which is entirely self-hosted into a private
AWS account. Already accepted for every other network in Beeper.

**Read receipts can cross over.**
Two clients now share one BlueBubbles server and either can mark a chat read.
Watch for Beeper marking things read out from under you.

**A new always-on process with its own failure mode.**
The CloudWatch heartbeat alarm covers the mac-agent only. If this bridge dies,
nothing pages — iMessage just stops appearing in Beeper. Check
`~/Library/Logs/beeper-bridge/beeper-bridge.log`.

**Never pass `--param bluebubbles_password=…` to a long-running bridge.**
It puts the password in the process table, where any `ps` shows it in plaintext:

```
bbctl run --type imessage … --param bluebubbles_password=<secret> sh-imessage
```

It is unavoidable on the *first* run, since that call generates the config. After
that the password lives in `config.yaml` and the launchd job starts with
`--no-override-config` and no `--param` at all. That is a second reason the flag
is load-bearing, not just config safety.

---

## Progress

| Step | State |
| --- | --- |
| 1. Verify BlueBubbles | ✅ Server 1.9.9, socket.io handshake 200 + `upgrades:["websocket"]` |
| 1b. Baseline mac-agent | ✅ launchd exit 0, publishing, 0 errors |
| 2. `bbctl` | ✅ v0.14.0 |
| 2. `ffmpeg` | ✅ 9.0.1 (built from source — Tier 3 Intel, ~1h) |
| 2b. libolm symlink | ✅ required; see *Gotchas* |
| 3. `bbctl login` | ✅ `@nortakales:beeper.com` |
| 4. Run bridge | ✅ `mautrix-imessage 0.1.0+dev.300ba6d0`, **38 portals**, 0 fatals |
| 5. Verify config | ✅ all three params present in `config.yaml` |
| 6. launchd | ✅ installed and `state = running` |
| 7. Cut over | ✅ two-way verified — see below |

**Two-way traffic verified end to end:**

- **Inbound** — messages reach Beeper, and the iCloud Bridge mirror publishes the
  same messages at the same moment. Coexistence is proven under live traffic, not
  just by inspection: both consumers received the same events with no
  interference.
- **Outbound** — a message sent from Beeper Desktop appeared on the iPhone
  instantly (`Sent message checkpoint` in the log).
- **Known latency** — messages sent from the iPhone lag; see the first entry
  under *Gotchas*. Not a bridge fault and not fixable here.

At cut-over: 1220 messages bridged, 38 portals, 0 fatals, both services up.

Verified at setup time: macOS 15.7.9 · x86_64 · BlueBubbles 1.9.9 ·
`private_api: False` · `proxy_service: cloudflare` · iCloud `nortakales@gmail.com`
