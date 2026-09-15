#!/bin/bash
#
# Work around BlueBubbles missing new messages on an idle Mac.
#
# Messages.app keeps chat.db in SQLite WAL mode: new messages are appended to
# chat.db-wal and only folded into chat.db at a checkpoint. BlueBubbles watches
# chat.db itself, so until a checkpoint fires it sees no change and emits no
# new-message event -- to its two consumers (the icloud-bridge mac-agent and the
# Beeper bridge) the conversation simply stops.
#
# On a busy Mac checkpoints are frequent and nobody notices. On this idle
# headless mini they can be an hour apart. Measured 2026-09-15: chat.db frozen
# at 11:07:38 while chat.db-wal was still being written at 12:47:18, with an
# inbound message from 11:53:50 sitting unread in the WAL by both consumers.
#
# The fix is only a metadata update -- utimensat on chat.db, no content written,
# no SQLite connection opened. That is deliberate: forcing a real checkpoint
# would need a writable handle on Messages' own database, which is not a risk
# worth taking to solve a visibility problem. Bumping mtime is enough, because
# BlueBubbles is watching the file, not the data. In testing the stuck message
# reached both Beeper and AWS 1 second after the touch.
#
# Touch only when the WAL is actually ahead, so an idle Mac stays idle.

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
