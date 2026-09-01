import { PutEventsCommand, type PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import type { AwsClients } from './aws';
import type { AgentConfig } from './config';
import {
    AGENT_EVENT_SOURCE,
    IngestDetailType,
    type MessageInput,
    type ReminderInput,
    type ReminderListInput,
} from './contract';
import { logger } from './logger';

const log = logger('publisher');

/**
 * The agent's read path: everything observed locally is published to the ingest
 * bus, and a Lambda on the other side writes it to DynamoDB.
 *
 * EventBridge limits both an individual entry AND the total PutEvents request to
 * 256KB, and a request to 10 entries. The request-level cap is the easy one to
 * miss: batching items into entries is not enough, the entries themselves must
 * then be grouped so no single call exceeds the total.
 */

/** Headroom under EventBridge's 256KB entry limit for the envelope it adds. */
const MAX_ENTRY_BYTES = 100 * 1024;
/** Headroom under the 256KB *request* limit, summed across a call's entries. */
const MAX_REQUEST_BYTES = 240 * 1024;
const MAX_ENTRIES_PER_REQUEST = 10;

export class Publisher {

    constructor(private readonly aws: AwsClients, private readonly config: AgentConfig) { }

    async publishMessages(messages: MessageInput[]) {
        await this.publish(IngestDetailType.MESSAGE_UPSERTED, messages, batch => ({ messages: batch }));
    }

    async publishReminders(reminders: ReminderInput[]) {
        await this.publish(IngestDetailType.REMINDER_UPSERTED, reminders, batch => ({ reminders: batch }));
    }

    async publishReminderDeletions(deleted: { listId: string; reminderId: string }[]) {
        await this.publish(IngestDetailType.REMINDER_DELETED, deleted, batch => ({ deleted: batch }));
    }

    async publishReminderLists(lists: ReminderListInput[]) {
        // Always sent whole: the ingest side treats it as a snapshot and prunes
        // any list missing from it, so splitting would delete real lists.
        await this.putEntries(IngestDetailType.REMINDER_LISTS_SNAPSHOT, [{ lists }]);
    }

    private async publish<T>(
        detailType: string,
        items: T[],
        wrap: (batch: T[]) => Record<string, unknown>,
    ) {
        if (items.length === 0) return;
        const details = packBySize(items).map(wrap);
        await this.putEntries(detailType, details);
        log.info(`Published ${items.length} item(s) as ${details.length} ${detailType} event(s)`);
    }

    private async putEntries(detailType: string, details: Record<string, unknown>[]) {
        const entries: PutEventsRequestEntry[] = details.map(detail => ({
            EventBusName: this.config.eventBusName,
            Source: AGENT_EVENT_SOURCE,
            DetailType: detailType,
            Detail: JSON.stringify(detail),
        }));

        for (const chunk of groupIntoRequests(entries)) {
            const bytes = chunk.reduce((sum, entry) => sum + entrySize(entry), 0);
            try {
                const response = await this.aws.events.send(new PutEventsCommand({ Entries: chunk }));

                if (response.FailedEntryCount) {
                    // Surfacing the first reason is enough to diagnose; the caller
                    // retries the whole batch, which is safe because ingest upserts.
                    const failure = response.Entries?.find(entry => entry.ErrorCode);
                    throw new Error(
                        `EventBridge rejected ${response.FailedEntryCount} of ${chunk.length} ${detailType} entries: ` +
                        `${failure?.ErrorCode} ${failure?.ErrorMessage}`,
                    );
                }
            } catch (e) {
                // PutEvents reports an oversized request as an unmodelled error, so
                // the shape of the request is worth recording alongside it.
                throw new Error(
                    `PutEvents failed for ${chunk.length} ${detailType} entr(ies), ${bytes} bytes: ${(e as Error).message}`,
                );
            }
        }
    }
}

/** Groups entries so each PutEvents call stays under both the size and count caps. */
function* groupIntoRequests(entries: PutEventsRequestEntry[]): Generator<PutEventsRequestEntry[]> {
    let current: PutEventsRequestEntry[] = [];
    let bytes = 0;

    for (const entry of entries) {
        const size = entrySize(entry);
        if (current.length > 0 && (bytes + size > MAX_REQUEST_BYTES || current.length >= MAX_ENTRIES_PER_REQUEST)) {
            yield current;
            current = [];
            bytes = 0;
        }
        current.push(entry);
        bytes += size;
    }
    if (current.length > 0) yield current;
}

/** Approximates what EventBridge counts toward the request limit. */
function entrySize(entry: PutEventsRequestEntry): number {
    return Buffer.byteLength(
        (entry.Detail ?? '') + (entry.DetailType ?? '') + (entry.Source ?? '') + (entry.EventBusName ?? ''),
        'utf-8',
    );
}

/** Greedily packs items into batches whose JSON stays under the entry limit. */
function packBySize<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    let currentBytes = 2; // the enclosing [] of the array

    for (const item of items) {
        const size = Buffer.byteLength(JSON.stringify(item), 'utf-8') + 1;
        if (current.length > 0 && currentBytes + size > MAX_ENTRY_BYTES) {
            batches.push(current);
            current = [];
            currentBytes = 2;
        }
        current.push(item);
        currentBytes += size;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}
