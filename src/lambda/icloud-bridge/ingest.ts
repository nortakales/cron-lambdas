import { EventBridgeEvent } from 'aws-lambda';
import { ddb, isConditionalCheckFailure } from './shared/ddb';
import {
    IngestDetailType,
    LIST_REGISTRY_PARTITION,
    MessageUpsertedDetail,
    ReminderDeletedDetail,
    ReminderInput,
    ReminderListsSnapshotDetail,
    ReminderUpsertedDetail,
    toMessageRecord,
    toReminderRecord,
} from './shared/model';

/**
 * Read path terminus: takes the events the Mac agent publishes on the ingest bus
 * and writes them into the DynamoDB mirror.
 *
 * Apple remains the source of truth, so every write here is an idempotent upsert
 * keyed by the Apple identifier (message GUID, EventKit item id). Replaying an
 * event is always safe.
 */

const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME!;
const REMINDERS_TABLE = process.env.REMINDERS_TABLE_NAME!;
const MESSAGE_RETENTION_DAYS = Number(process.env.MESSAGE_RETENTION_DAYS!);

/** DynamoDB's hard limit for BatchWriteItem. */
const BATCH_SIZE = 25;

export const handler = async (event: EventBridgeEvent<string, any>) => {
    const detailType = event['detail-type'];
    console.log(`Ingesting ${detailType} from ${event.source} (event ${event.id})`);

    switch (detailType) {
        case IngestDetailType.MESSAGE_UPSERTED:
            return await ingestMessages(event.detail as MessageUpsertedDetail);
        case IngestDetailType.REMINDER_UPSERTED:
            return await ingestReminders(event.detail as ReminderUpsertedDetail);
        case IngestDetailType.REMINDER_DELETED:
            return await deleteReminders(event.detail as ReminderDeletedDetail);
        case IngestDetailType.REMINDER_LISTS_SNAPSHOT:
            return await syncListRegistry(event.detail as ReminderListsSnapshotDetail);
        default:
            // Throwing puts the event on the rule's DLQ rather than silently dropping it.
            throw new Error(`Unsupported ingest detail-type: ${detailType}`);
    }
};

async function ingestMessages(detail: MessageUpsertedDetail) {
    const messages = detail?.messages ?? [];
    if (messages.length === 0) {
        console.log('No messages in event, nothing to ingest');
        return { written: 0 };
    }

    const records = messages.map(message => toMessageRecord(message, MESSAGE_RETENTION_DAYS));
    await batchPut(MESSAGES_TABLE, records);

    console.log(`Wrote ${records.length} message(s) to ${MESSAGES_TABLE}`);
    return { written: records.length };
}

async function ingestReminders(detail: ReminderUpsertedDetail) {
    const reminders = detail?.reminders ?? [];
    let written = 0;

    // Written one at a time rather than batched: each carries a guard against an
    // out-of-order replay clobbering a newer version, and BatchWriteItem cannot
    // express conditions.
    for (const reminder of reminders) {
        if (await putReminder(reminder)) written++;
    }

    console.log(`Wrote ${written} of ${reminders.length} reminder(s) to ${REMINDERS_TABLE}`);
    return { written, skipped: reminders.length - written };
}

async function putReminder(input: ReminderInput): Promise<boolean> {
    const record = toReminderRecord(input);

    // Only guard when Apple gave us a modification date to compare against.
    const guarded = input.appleLastModified !== undefined;

    try {
        await ddb.put({
            TableName: REMINDERS_TABLE,
            Item: record,
            ...(guarded
                ? {
                    ConditionExpression:
                        'attribute_not_exists(reminderId) OR attribute_not_exists(appleLastModified) OR appleLastModified <= :incoming',
                    ExpressionAttributeValues: { ':incoming': input.appleLastModified },
                }
                : {}),
        });
        return true;
    } catch (e) {
        if (isConditionalCheckFailure(e)) {
            console.log(`Skipping stale update for reminder ${input.reminderId} (${input.appleLastModified})`);
            return false;
        }
        throw e;
    }
}

async function deleteReminders(detail: ReminderDeletedDetail) {
    const deleted = detail?.deleted ?? [];

    for (const chunk of chunked(deleted)) {
        await ddb.batchWrite({
            RequestItems: {
                [REMINDERS_TABLE]: chunk.map(key => ({ DeleteRequest: { Key: key } })),
            },
        });
    }

    console.log(`Deleted ${deleted.length} reminder(s) from ${REMINDERS_TABLE}`);
    return { deleted: deleted.length };
}

/**
 * Replaces the reserved list-registry partition with the agent's snapshot, so a
 * list's name is known even when it holds no reminders, and renamed or removed
 * lists do not linger.
 */
async function syncListRegistry(detail: ReminderListsSnapshotDetail) {
    const lists = detail?.lists ?? [];
    const updatedAt = new Date().toISOString();

    const records = lists.map(list => ({
        listId: LIST_REGISTRY_PARTITION,
        reminderId: list.listId,
        listName: list.listName,
        isDefault: list.isDefault,
        updatedAt,
    }));
    await batchPut(REMINDERS_TABLE, records);

    const existing = await ddb.query({
        TableName: REMINDERS_TABLE,
        KeyConditionExpression: 'listId = :registry',
        ExpressionAttributeValues: { ':registry': LIST_REGISTRY_PARTITION },
        ProjectionExpression: 'listId, reminderId',
    });

    const current = new Set(lists.map(list => list.listId));
    const stale = (existing.Items ?? []).filter(item => !current.has(item.reminderId));

    for (const chunk of chunked(stale)) {
        await ddb.batchWrite({
            RequestItems: {
                [REMINDERS_TABLE]: chunk.map(item => ({
                    DeleteRequest: { Key: { listId: item.listId, reminderId: item.reminderId } },
                })),
            },
        });
    }

    console.log(`List registry now holds ${records.length} list(s); removed ${stale.length} stale entr(ies)`);
    return { lists: records.length, removed: stale.length };
}

async function batchPut(table: string, items: Record<string, any>[]) {
    for (const chunk of chunked(items)) {
        let unprocessed = await ddb.batchWrite({
            RequestItems: { [table]: chunk.map(Item => ({ PutRequest: { Item } })) },
        });

        // BatchWriteItem can partially succeed under throttling; retry what it returns.
        let attempt = 0;
        while (unprocessed.UnprocessedItems?.[table]?.length && attempt < 5) {
            attempt++;
            await sleep(2 ** attempt * 50);
            console.log(`Retrying ${unprocessed.UnprocessedItems[table].length} unprocessed write(s), attempt ${attempt}`);
            unprocessed = await ddb.batchWrite({ RequestItems: unprocessed.UnprocessedItems });
        }
        if (unprocessed.UnprocessedItems?.[table]?.length) {
            throw new Error(`Gave up on ${unprocessed.UnprocessedItems[table].length} write(s) to ${table} after ${attempt} retries`);
        }
    }
}

function* chunked<T>(items: T[]): Generator<T[]> {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        yield items.slice(i, i + BATCH_SIZE);
    }
}

function sleep(millis: number) {
    return new Promise(resolve => setTimeout(resolve, millis));
}
