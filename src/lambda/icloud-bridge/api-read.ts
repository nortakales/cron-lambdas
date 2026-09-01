import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ddb } from './shared/ddb';
import { startBridgeLog } from './shared/log';
import {
    badRequest,
    decodeCursor,
    encodeCursor,
    errorResponse,
    json,
    parseLimit,
} from './shared/http';
import {
    LIST_REGISTRY_PARTITION,
    MESSAGE_TIMELINE_KEY,
    MessageRecord,
    ReminderRecord,
} from './shared/model';

/** Index chosen per request, depending on whether a sender filter was given. */
interface MessageQueryPlan {
    indexName: string;
    keyConditionExpression: string;
    expressionAttributeValues: Record<string, any>;
}

/**
 * Read side of the consumer API: serves the DynamoDB mirror of Messages and
 * Reminders. Every list endpoint is cursor-paginated; cursors are opaque base64
 * of the DynamoDB LastEvaluatedKey so the key schema stays private.
 */

const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME!;
const REMINDERS_TABLE = process.env.REMINDERS_TABLE_NAME!;
const MESSAGE_TIMELINE_INDEX = process.env.MESSAGE_TIMELINE_INDEX!;
const MESSAGE_SENDER_INDEX = process.env.MESSAGE_SENDER_INDEX!;
const REMINDER_DUE_INDEX = process.env.REMINDER_DUE_INDEX!;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Ceiling on the pages walked when aggregating open counts for /reminders/lists. */
const MAX_AGGREGATE_PAGES = 20;
/** Pages read per request when a FilterExpression is in play. */
const FILTER_PAGE_SIZE = 200;
const MAX_FILTER_PAGES = 10;
/** Bounds a `q=` text search, which reads pages and filters them in the handler. */
const MAX_SEARCH_PAGES = 10;
const SEARCH_PAGE_SIZE = 200;

export const handler = async (
    event: APIGatewayProxyEventV2,
    context: any = {},
): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        startBridgeLog('icloud-bridge api-read', event, context);

        switch (event.routeKey) {
            case 'GET /messages':
                return await getMessages(event);
            case 'GET /messages/{chatId}':
                return await getChatMessages(event);
            case 'GET /reminders':
                return await getReminders(event);
            case 'GET /reminders/lists':
                return await getReminderLists();
            default:
                throw badRequest(`Unsupported route: ${event.routeKey}`);
        }
    } catch (e) {
        return errorResponse(e);
    }
};

// --- messages ---------------------------------------------------------------

async function getMessages(event: APIGatewayProxyEventV2) {
    const params = event.queryStringParameters ?? {};

    // `?chatId=` is the query-string spelling of the /messages/{chatId} route.
    if (params.chatId) {
        return await queryChat(params.chatId, params);
    }

    const limit = parseLimit(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const since = params.since ? isoOrReject(params.since, 'since') : undefined;

    // `?sender=` swaps the timeline index for the per-sender one; both are keyed
    // on createdAt, so everything downstream is identical.
    const plan: MessageQueryPlan = params.sender
        ? {
            indexName: MESSAGE_SENDER_INDEX,
            keyConditionExpression: since
                ? 'senderKey = :sender AND createdAt > :since'
                : 'senderKey = :sender',
            expressionAttributeValues: { ':sender': params.sender, ...(since ? { ':since': since } : {}) },
        }
        : {
            indexName: MESSAGE_TIMELINE_INDEX,
            keyConditionExpression: since
                ? 'timelineKey = :timeline AND createdAt > :since'
                : 'timelineKey = :timeline',
            expressionAttributeValues: { ':timeline': MESSAGE_TIMELINE_KEY, ...(since ? { ':since': since } : {}) },
        };

    if (params.q) {
        return await searchMessages(plan, params.q, limit, params.cursor);
    }

    const result = await ddb.query({
        TableName: MESSAGES_TABLE,
        IndexName: plan.indexName,
        KeyConditionExpression: plan.keyConditionExpression,
        ExpressionAttributeValues: plan.expressionAttributeValues,
        // Newest first: the common case is "what just came in".
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: decodeCursor(params.cursor),
    });

    return json(200, {
        items: (result.Items ?? []).map(toPublicMessage),
        nextCursor: encodeCursor(result.LastEvaluatedKey),
    });
}

/**
 * Best-effort text search over recent messages.
 *
 * DynamoDB cannot index free text, so this walks pages newest-first and matches
 * in the handler — which buys case-insensitivity that a `contains()` filter
 * expression could not give. It is bounded by MAX_SEARCH_PAGES, so it searches a
 * recent window rather than all history; `nextCursor` continues the walk.
 */
async function searchMessages(
    plan: MessageQueryPlan,
    query: string,
    limit: number,
    cursor: string | undefined,
) {
    const needle = query.toLowerCase();
    const matches: Record<string, any>[] = [];
    let startKey = decodeCursor(cursor);
    let scanned = 0;

    for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
        const result = await ddb.query({
            TableName: MESSAGES_TABLE,
            IndexName: plan.indexName,
            KeyConditionExpression: plan.keyConditionExpression,
            ExpressionAttributeValues: plan.expressionAttributeValues,
            ScanIndexForward: false,
            Limit: SEARCH_PAGE_SIZE,
            ExclusiveStartKey: startKey,
        });

        scanned += result.Items?.length ?? 0;
        for (const item of result.Items ?? []) {
            if (typeof item.text === 'string' && item.text.toLowerCase().includes(needle)) {
                matches.push(item);
            }
        }

        startKey = result.LastEvaluatedKey;
        // Whole pages are kept, so `limit` sets when to stop reading rather than
        // truncating results — that way the cursor never skips a match.
        if (!startKey || matches.length >= limit) break;
    }

    return json(200, {
        items: matches.map(toPublicMessage),
        searchedMessages: scanned,
        nextCursor: encodeCursor(startKey),
    });
}

async function getChatMessages(event: APIGatewayProxyEventV2) {
    const chatId = event.pathParameters?.chatId;
    if (!chatId) throw badRequest('chatId path parameter is required');
    return await queryChat(decodeURIComponent(chatId), event.queryStringParameters ?? {});
}

async function queryChat(chatId: string, params: Record<string, string | undefined>) {
    const limit = parseLimit(params.limit, DEFAULT_LIMIT, MAX_LIMIT);

    const result = await ddb.query({
        TableName: MESSAGES_TABLE,
        // The sort key is `${createdAt}#${guid}`, so an ISO8601 `since` compares
        // correctly against it without needing the GUID.
        KeyConditionExpression: params.since
            ? 'chatId = :chatId AND tsGuid > :since'
            : 'chatId = :chatId',
        ExpressionAttributeValues: {
            ':chatId': chatId,
            ...(params.since ? { ':since': isoOrReject(params.since, 'since') } : {}),
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: decodeCursor(params.cursor),
    });

    return json(200, {
        chatId,
        items: (result.Items ?? []).map(toPublicMessage),
        nextCursor: encodeCursor(result.LastEvaluatedKey),
    });
}

// --- reminders --------------------------------------------------------------

async function getReminders(event: APIGatewayProxyEventV2) {
    const params = event.queryStringParameters ?? {};
    const limit = parseLimit(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const completed = parseCompleted(params.completed);
    const dueBefore = params.dueBefore ? isoOrReject(params.dueBefore, 'dueBefore') : undefined;

    if (params.listId) {
        return await queryList(params.listId, { completed, dueBefore, limit, cursor: params.cursor });
    }
    return await queryByCompletion({ completed, dueBefore, limit, cursor: params.cursor });
}

async function queryList(
    listId: string,
    opts: { completed?: boolean; dueBefore?: string; limit: number; cursor?: string },
) {
    if (listId === LIST_REGISTRY_PARTITION) {
        throw badRequest(`${LIST_REGISTRY_PARTITION} is a reserved listId; use GET /reminders/lists`);
    }

    const filters: string[] = [];
    const values: Record<string, any> = { ':listId': listId };
    if (opts.completed !== undefined) {
        filters.push('completed = :completed');
        values[':completed'] = opts.completed;
    }
    if (opts.dueBefore !== undefined) {
        filters.push('dueSort < :dueBefore');
        values[':dueBefore'] = opts.dueBefore;
    }

    const filterExpression = filters.length ? filters.join(' AND ') : undefined;
    const items: Record<string, any>[] = [];
    let startKey = decodeCursor(opts.cursor);
    let pages = 0;

    // DynamoDB applies a FilterExpression *after* Limit, so a single page can
    // return far fewer rows than asked for -- a list with 38 open reminders was
    // answering with 6. Pages are walked until the request is satisfied so that
    // `limit` means "up to this many results", which is what a caller expects.
    do {
        const result = await ddb.query({
            TableName: REMINDERS_TABLE,
            KeyConditionExpression: 'listId = :listId',
            ExpressionAttributeValues: values,
            ...(filterExpression ? { FilterExpression: filterExpression } : {}),
            Limit: filterExpression ? FILTER_PAGE_SIZE : opts.limit,
            ExclusiveStartKey: startKey,
        });
        items.push(...(result.Items ?? []));
        startKey = result.LastEvaluatedKey;
    } while (filterExpression && startKey && items.length < opts.limit && ++pages < MAX_FILTER_PAGES);

    return json(200, {
        items: items.slice(0, opts.limit).map(toPublicReminder),
        // Truncating to `limit` would strand the remainder, so the cursor is only
        // returned when nothing was dropped; otherwise the caller re-reads the
        // page boundary rather than skipping rows.
        nextCursor: items.length <= opts.limit ? encodeCursor(startKey) : undefined,
        ...(items.length > opts.limit ? { truncated: true } : {}),
    });
}

/**
 * Queries the due-date GSI, whose partition key is the stringified `completed`
 * flag. With no `completed` filter the two partitions are walked in sequence —
 * open reminders first, then completed — and the cursor records which phase it
 * is in, so pagination still yields every item exactly once.
 */
async function queryByCompletion(opts: {
    completed?: boolean;
    dueBefore?: string;
    limit: number;
    cursor?: string;
}) {
    const phases: ('false' | 'true')[] =
        opts.completed === undefined ? ['false', 'true'] : [opts.completed ? 'true' : 'false'];

    const decoded = decodeCursor(opts.cursor);
    const startPhase = (decoded?.phase as 'false' | 'true' | undefined) ?? phases[0];
    let startKey = decoded?.key as Record<string, any> | undefined;

    const items: Record<string, any>[] = [];
    for (const phase of phases.slice(phases.indexOf(startPhase))) {
        const result = await ddb.query({
            TableName: REMINDERS_TABLE,
            IndexName: REMINDER_DUE_INDEX,
            KeyConditionExpression: opts.dueBefore
                ? 'completedKey = :phase AND dueSort < :dueBefore'
                : 'completedKey = :phase',
            ExpressionAttributeValues: {
                ':phase': phase,
                ...(opts.dueBefore ? { ':dueBefore': opts.dueBefore } : {}),
            },
            // Soonest due first; undated reminders sort last by construction.
            ScanIndexForward: true,
            Limit: opts.limit - items.length,
            ExclusiveStartKey: startKey,
        });
        items.push(...(result.Items ?? []));

        if (result.LastEvaluatedKey) {
            return json(200, {
                items: items.map(toPublicReminder),
                nextCursor: encodeCursor({ phase, key: result.LastEvaluatedKey }),
            });
        }
        // This phase is exhausted; the next one starts from its beginning.
        startKey = undefined;
        if (items.length >= opts.limit) {
            const next = phases[phases.indexOf(phase) + 1];
            return json(200, {
                items: items.map(toPublicReminder),
                nextCursor: next ? encodeCursor({ phase: next }) : undefined,
            });
        }
    }

    return json(200, { items: items.map(toPublicReminder) });
}

async function getReminderLists() {
    const registry = await ddb.query({
        TableName: REMINDERS_TABLE,
        KeyConditionExpression: 'listId = :registry',
        ExpressionAttributeValues: { ':registry': LIST_REGISTRY_PARTITION },
    });

    const openCounts = await countOpenByList();

    const lists = (registry.Items ?? []).map(item => ({
        listId: item.reminderId as string,
        listName: item.listName as string,
        isDefault: item.isDefault as boolean | undefined,
        sourceName: item.sourceName as string | undefined,
        isLocal: item.isLocal as boolean | undefined,
        openCount: openCounts.get(item.reminderId as string) ?? 0,
    }));

    // A list the agent has not registered yet still shows up if it has reminders.
    for (const [listId, openCount] of openCounts) {
        if (!lists.some(list => list.listId === listId)) {
            lists.push({
                listId,
                listName: listId,
                isDefault: undefined,
                sourceName: undefined,
                isLocal: undefined,
                openCount,
            });
        }
    }

    lists.sort((a, b) => a.listName.localeCompare(b.listName));
    return json(200, { lists });
}

async function countOpenByList(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    let startKey: Record<string, any> | undefined;
    let pages = 0;

    do {
        const result = await ddb.query({
            TableName: REMINDERS_TABLE,
            IndexName: REMINDER_DUE_INDEX,
            KeyConditionExpression: 'completedKey = :open',
            ExpressionAttributeValues: { ':open': 'false' },
            ProjectionExpression: 'listId',
            ExclusiveStartKey: startKey,
        });
        for (const item of result.Items ?? []) {
            counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
        }
        startKey = result.LastEvaluatedKey;
    } while (startKey && ++pages < MAX_AGGREGATE_PAGES);

    if (startKey) {
        console.warn(`Open-reminder count truncated after ${MAX_AGGREGATE_PAGES} pages`);
    }
    return counts;
}

// --- shaping ----------------------------------------------------------------

/** Drops the attributes that exist only to support indexes and retention. */
function toPublicMessage(item: Record<string, any>) {
    const { timelineKey, senderKey, ttl, tsGuid, ...rest } = item as MessageRecord & Record<string, any>;
    return rest;
}

function toPublicReminder(item: Record<string, any>) {
    const { completedKey, dueSort, ...rest } = item as ReminderRecord & Record<string, any>;
    return rest;
}

function parseCompleted(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw badRequest("completed must be 'true' or 'false'");
}

function isoOrReject(value: string, field: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw badRequest(`${field} must be an ISO8601 date-time`);
    }
    return parsed.toISOString();
}
