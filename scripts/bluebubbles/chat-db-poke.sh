#!/bin/bash
#
# MANUAL TOOL. Run it by hand when messages have stalled. It is deliberately
# NOT a LaunchAgent -- that was tried on 2026-09-15 and withdrawn within the
# hour, because launchd-spawned /bin/bash has no Full Disk Access and every run
# failed with "Operation not permitted" on ~/Library/Messages/chat.db. An
# interactive shell inherits the terminal's FDA grant, which is why testing it
# by hand looked fine. Do NOT "fix" that by granting /bin/bash Full Disk Access:
# that hands FDA to every script on the machine, and it would be chasing a lever
# that is not even confirmed to be the right one (see below).
#
# What it is for. BlueBubbles' new-message detection sometimes goes deaf while
# its websocket, its HTTP API and Messages.app all stay healthy -- both the
# icloud-bridge mac-agent and the Beeper bridge then receive nothing, for up to
# an hour, while messages accumulate in chat.db's write-ahead log. Touching
# chat.db has once been followed 1 second later by both consumers draining the
# backlog.
#
# Read that carefully: *once*, and *followed by*. On that occasion a curl to the
# BlueBubbles API and two sqlite3 opens had also happened 66s and 17s earlier, so
# three candidate triggers sat inside 80 seconds and the data could not separate
# them. Worse, a later message was detected normally while chat.db's mtime stayed
# frozen -- which rules out "BlueBubbles needs an mtime change" as the mechanism.
#
# So: this may simply not be what unsticks it. It is cheap and non-destructive,
# so it is a reasonable first thing to try, but if you use it, use it ALONE and
# record whether it worked. Full analysis, including two already-refuted root
# causes, is in docs/beeper-imessage-bridge.md under Gotchas.
#
# It only ever updates mtime -- no content written, no SQLite connection opened.
# Forcing a real checkpoint would need a writable handle on Messages' own
# database, which is not worth the risk.

set -uo pipefail

CHAT_DB="$HOME/Library/Messages/chat.db"
WAL="${CHAT_DB}-wal"

[ -f "$CHAT_DB" ] || exit 0
[ -f "$WAL" ]     || exit 0   # no WAL means nothing is pending

db_mtime=$(stat -f %m "$CHAT_DB" 2>/dev/null) || exit 0
wal_mtime=$(stat -f %m "$WAL"    2>/dev/null) || exit 0

# WAL newer than the DB file => unflushed messages BlueBubbles cannot see yet.
if [ "$wal_mtime" -gt "$db_mtime" ]; then
    if touch "$CHAT_DB" 2>/dev/null; then
        echo "$(date '+%Y-%m-%dT%H:%M:%S%z') poked chat.db (wal was $((wal_mtime - db_mtime))s ahead)"
    else
        echo "$(date '+%Y-%m-%dT%H:%M:%S%z') ERROR: touch failed -- check Full Disk Access" >&2
        exit 1
    fi
fi
