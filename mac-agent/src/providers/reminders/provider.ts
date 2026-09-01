import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { PermanentCommandError } from '../../command-poller';
import type { CommandEnvelope, CommandType, ReminderInput } from '../../contract';
import { logger } from '../../logger';
import type { Publisher } from '../../publisher';
import { SnapshotStore } from '../../snapshot-store';
import { SyncState, SyncStateKey } from '../../sync-state';
import type { Provider } from '../types';
import {
    RemindersHelperClient,
    type HelperReminder,
    type HelperSnapshot,
} from './helper-client';

const execFileAsync = promisify(execFile);

const log = logger('reminders');

/**
 * Reminders provider.
 *
 * EventKit has no change feed — only a coarse "something changed" notification —
 * so the Swift helper reports a full snapshot and the diff happens here. Keeping
 * the diff on this side means the previous state can live in DynamoDB
 * (`sync_state`), which is what makes the provider restart-safe: after a reboot
 * it compares against what AWS last saw rather than starting blind.
 *
 * The stored snapshot is a fingerprint map, not the reminders themselves — one
 * short hash and a list id per reminder. That keeps the checkpoint far inside
 * DynamoDB's 400KB item limit and puts no reminder content in it.
 */

interface Fingerprint {
    /** Content hash, so an unchanged reminder is not republished. */
    h: string;
    /** Owning list, needed to build the delete key once the reminder is gone. */
    l: string;
}

type FingerprintMap = Record<string, Fingerprint>;

export class RemindersProvider implements Provider {

    readonly name = 'reminders';
    readonly commandTypes: readonly CommandType[] = [
        'add_reminder',
        'complete_reminder',
        'update_reminder',
    ];

    /** Serializes snapshot handling so two bursts cannot interleave their diffs. */
    private processing: Promise<void> = Promise.resolve();

    private readonly snapshots = SnapshotStore.forProvider('reminders');

    constructor(
        private readonly helper: RemindersHelperClient,
        private readonly publisher: Publisher,
        private readonly syncState: SyncState,
        private readonly completedRetentionDays: number,
    ) { }

    async start(): Promise<void> {
        await this.ensureRemindersAppRunning();
        this.helper.startObserving(snapshot => this.enqueue(snapshot));
    }

    /**
     * EventKit reads the *local* Reminders store, and macOS only pulls that store
     * from iCloud while Reminders.app is running. With the app closed the store
     * goes stale indefinitely: a reminder added on the phone simply never arrives,
     * and the observer correctly reports no change because locally there is none.
     *
     * Launching it hidden and in the background (-j -g) keeps sync alive without
     * stealing focus. This is the direct analogue of BlueBubbles needing
     * Messages.app running to see iMessage at all.
     */
    private async ensureRemindersAppRunning(): Promise<void> {
        try {
            await execFileAsync('open', ['-j', '-g', '-a', 'Reminders']);
            log.info('Ensured Reminders.app is running so iCloud keeps the local store fresh');
        } catch (e) {
            // Not fatal: the local store may still be current enough to be useful,
            // and the observer will report whatever EventKit has.
            log.warn('Could not launch Reminders.app; the local store may go stale', e);
        }
    }

    async stop(): Promise<void> {
        this.helper.stopObserving();
        await this.processing;
    }

    async execute(command: CommandEnvelope): Promise<Record<string, unknown>> {
        const payload = command.payload;

        switch (command.type) {
            case 'add_reminder':
                return await this.helper.exec({ action: 'add', ...payload });

            case 'complete_reminder':
            case 'update_reminder': {
                if (!payload.reminderId) {
                    // No retry will supply a missing id.
                    throw new PermanentCommandError(`${command.type} is missing reminderId`);
                }
                return await this.helper.exec({
                    action: command.type === 'complete_reminder' ? 'complete' : 'update',
                    ...payload,
                });
            }

            default:
                throw new PermanentCommandError(`${this.name} provider cannot execute ${command.type}`);
        }
    }

    // --- read path ----------------------------------------------------------

    private enqueue(snapshot: HelperSnapshot): Promise<void> {
        this.processing = this.processing
            .then(() => this.onSnapshot(snapshot))
            .catch(e => log.error('Failed to publish reminders diff', e));
        return this.processing;
    }

    private async onSnapshot(snapshot: HelperSnapshot): Promise<void> {
        const previous = (await this.snapshots.read<FingerprintMap>()) ?? {};
        const current: FingerprintMap = {};

        const upserts: ReminderInput[] = [];
        const deletions: { listId: string; reminderId: string }[] = [];

        // Filtering before the diff (rather than expiring rows in DynamoDB) is
        // what keeps the mirror consistent: a reminder that ages out simply stops
        // appearing in `current`, so the loop below emits a deletion for it like
        // any other removal. A TTL would delete the row while the fingerprint map
        // still claimed it was published, and the mirror would never heal.
        const retained = snapshot.reminders.filter(reminder => this.isRetained(reminder));
        const aged = snapshot.reminders.length - retained.length;

        for (const reminder of retained) {
            const hash = fingerprint(reminder);
            current[reminder.reminderId] = { h: hash, l: reminder.listId };

            const before = previous[reminder.reminderId];
            if (before?.h === hash) continue;

            // Moving a reminder between lists changes its partition key, so the row
            // under the old list has to be removed explicitly.
            if (before && before.l !== reminder.listId) {
                deletions.push({ listId: before.l, reminderId: reminder.reminderId });
            }
            upserts.push(toReminderInput(reminder));
        }

        for (const [reminderId, before] of Object.entries(previous)) {
            if (!current[reminderId]) {
                deletions.push({ listId: before.l, reminderId });
            }
        }

        // Lists go first so a brand-new list is named by the time its reminders
        // arrive, and always in full — the ingest side treats it as a snapshot.
        await this.publisher.publishReminderLists(snapshot.lists);

        if (upserts.length) await this.publisher.publishReminders(upserts);
        if (deletions.length) await this.publisher.publishReminderDeletions(deletions);

        // Checkpointed only after a successful publish, so a failed push is retried
        // by the next snapshot rather than being silently forgotten.
        await this.snapshots.write(current);

        // A summary rather than the map itself: enough to see from AWS that the
        // provider is alive and how much it is tracking, small enough to never
        // hit the item-size limit that the full map does.
        await this.syncState.setQuietly(SyncStateKey.REMINDERS_SNAPSHOT, {
            reminderCount: Object.keys(current).length,
            listCount: snapshot.lists.length,
            capturedAt: snapshot.capturedAt,
        });

        const agedNote = aged > 0 ? ` (${aged} completed reminder(s) past the retention window excluded)` : '';
        if (upserts.length || deletions.length) {
            log.info(`Published ${upserts.length} change(s) and ${deletions.length} deletion(s) across ${snapshot.lists.length} list(s)${agedNote}`);
        } else {
            log.info(`Snapshot at ${snapshot.capturedAt}: no reminder changes${agedNote}`);
        }
    }

    /**
     * Whether a reminder belongs in the mirror.
     *
     * Only *completed* reminders age out — an open reminder is still actionable
     * however old it is. A completed reminder with no completion date is kept,
     * since its age is unknown and dropping it would be a guess.
     */
    private isRetained(reminder: HelperReminder): boolean {
        if (this.completedRetentionDays <= 0) return true;
        if (!reminder.completed) return true;
        if (!reminder.completionDate) return true;

        const completedAt = Date.parse(reminder.completionDate);
        if (Number.isNaN(completedAt)) return true;

        const ageDays = (Date.now() - completedAt) / 86_400_000;
        return ageDays <= this.completedRetentionDays;
    }
}

/**
 * Hashes only the fields the mirror stores, so a change EventKit reports that
 * does not affect anything we publish produces no traffic.
 */
function fingerprint(reminder: HelperReminder): string {
    return createHash('sha1')
        .update(JSON.stringify([
            reminder.listId,
            reminder.listName,
            reminder.title,
            reminder.notes ?? '',
            reminder.completed,
            reminder.completionDate ?? '',
            reminder.dueDate ?? '',
            reminder.priority,
            // Included so an edited recurrence rule is detected as a change; a
            // field the mirror stores but the fingerprint ignores would never
            // propagate after its first publish.
            reminder.recurrence ? JSON.stringify(reminder.recurrence) : '',
            reminder.startDate ?? '',
            reminder.url ?? '',
        ]))
        .digest('base64')
        // 12 base64 chars is ~72 bits: collision risk is irrelevant at this scale,
        // and it keeps the checkpoint small.
        .slice(0, 12);
}

function toReminderInput(reminder: HelperReminder): ReminderInput {
    return {
        listId: reminder.listId,
        listName: reminder.listName,
        reminderId: reminder.reminderId,
        title: reminder.title,
        // EventKit reports cleared notes as an empty string rather than nil;
        // consumers should see the field absent, matching a reminder never given
        // notes at all.
        notes: reminder.notes || undefined,
        completed: reminder.completed,
        dueDate: reminder.dueDate ?? undefined,
        // EventKit uses 0 for "no priority"; keep it absent rather than storing 0.
        priority: reminder.priority || undefined,
        completionDate: reminder.completionDate ?? undefined,
        startDate: reminder.startDate ?? undefined,
        url: reminder.url ?? undefined,
        creationDate: reminder.creationDate ?? undefined,
        recurrence: reminder.recurrence?.map(rule => ({
            frequency: rule.frequency,
            interval: rule.interval,
            daysOfTheWeek: rule.daysOfTheWeek ?? undefined,
            daysOfTheMonth: rule.daysOfTheMonth ?? undefined,
            monthsOfTheYear: rule.monthsOfTheYear ?? undefined,
            weeksOfTheYear: rule.weeksOfTheYear ?? undefined,
            daysOfTheYear: rule.daysOfTheYear ?? undefined,
            setPositions: rule.setPositions ?? undefined,
            endDate: rule.endDate ?? undefined,
            occurrenceCount: rule.occurrenceCount ?? undefined,
        })) ?? undefined,
        appleLastModified: reminder.appleLastModified ?? undefined,
    };
}
