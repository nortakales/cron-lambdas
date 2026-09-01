import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ulid } from 'ulid';
import { ddb } from './shared/ddb';
import { startBridgeLog } from './shared/log';
import {
    ApiError,
    badRequest,
    errorResponse,
    json,
    optionalIsoDate,
    optionalNumber,
    optionalString,
    parseJsonBody,
    requireString,
} from './shared/http';
import { CommandEnvelope, CommandRecord, CommandType, epochSecondsFromNow } from './shared/model';

/**
 * Write side of the consumer API.
 *
 * Nothing is executed here: the Mac is behind NAT, so a write is recorded as a
 * command, dropped on the queue the agent long-polls, and acknowledged with
 * `202 { commandId }`. Consumers follow up on `GET /commands/{commandId}`.
 */

const COMMANDS_TABLE = process.env.COMMANDS_TABLE_NAME!;
const COMMAND_QUEUE_URL = process.env.COMMAND_QUEUE_URL!;
const COMMAND_RETENTION_DAYS = Number(process.env.COMMAND_RETENTION_DAYS!);
const REGION = process.env.REGION!;

const sqs = new SQSClient({ region: REGION });

/** Reminder priority follows EventKit: 0 = none, 1 = high, 5 = medium, 9 = low. */
const MAX_PRIORITY = 9;
const MAX_MESSAGE_LENGTH = 10000;

export const handler = async (
    event: APIGatewayProxyEventV2,
    context: any = {},
): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        startBridgeLog('icloud-bridge api-write', event, context);
        const body = parseJsonBody(event);

        switch (event.routeKey) {
            case 'POST /messages':
                return await enqueue('send_message', sendMessagePayload(body));
            case 'POST /reminders':
                return await enqueue('add_reminder', addReminderPayload(body));
            case 'PATCH /reminders/{reminderId}':
                return await enqueueReminderUpdate(event, body);
            default:
                throw badRequest(`Unsupported route: ${event.routeKey}`);
        }
    } catch (e) {
        return errorResponse(e);
    }
};

// --- payload validation -----------------------------------------------------

function sendMessagePayload(body: Record<string, any>) {
    // `chatGuid` is the spec's name; `chatId` is accepted so the read and write
    // sides can be driven with the same identifier.
    const chatGuid = requireString(body.chatGuid ?? body.chatId, 'chatGuid');
    const text = requireString(body.text, 'text');

    if (text.length > MAX_MESSAGE_LENGTH) {
        throw badRequest(`text exceeds ${MAX_MESSAGE_LENGTH} characters`);
    }
    if (body.attachments !== undefined) {
        throw new ApiError(
            400,
            'UNSUPPORTED',
            'Sending attachments is not supported yet; send text only',
        );
    }

    return { chatGuid, text };
}

function addReminderPayload(body: Record<string, any>) {
    return {
        listId: optionalString(body.listId, 'listId'),
        title: requireString(body.title, 'title'),
        notes: optionalString(body.notes, 'notes'),
        dueDate: optionalIsoDate(body.dueDate, 'dueDate'),
        priority: priority(body.priority),
    };
}

async function enqueueReminderUpdate(event: APIGatewayProxyEventV2, body: Record<string, any>) {
    const reminderId = event.pathParameters?.reminderId;
    if (!reminderId) throw badRequest('reminderId path parameter is required');

    const payload: Record<string, any> = { reminderId: decodeURIComponent(reminderId) };

    // `null` is meaningful and distinct from absent: it clears the field.
    if ('completed' in body) {
        if (typeof body.completed !== 'boolean') throw badRequest('completed must be a boolean');
        payload.completed = body.completed;
    }
    if ('title' in body) payload.title = requireString(body.title, 'title');
    if ('notes' in body) payload.notes = body.notes === null ? null : optionalString(body.notes, 'notes');
    if ('dueDate' in body) payload.dueDate = body.dueDate === null ? null : optionalIsoDate(body.dueDate, 'dueDate');
    if ('priority' in body) payload.priority = body.priority === null ? null : priority(body.priority);
    if ('listId' in body) payload.listId = requireString(body.listId, 'listId');

    if (Object.keys(payload).length === 1) {
        throw badRequest('Provide at least one of: completed, title, notes, dueDate, priority, listId');
    }

    // A body that only toggles completion is the dedicated `complete_reminder`
    // command; anything richer goes through the general update path.
    const type: CommandType =
        Object.keys(payload).length === 2 && 'completed' in payload
            ? 'complete_reminder'
            : 'update_reminder';

    return await enqueue(type, payload);
}

function priority(value: unknown): number | undefined {
    const parsed = optionalNumber(value, 'priority');
    if (parsed === undefined) return undefined;
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PRIORITY) {
        throw badRequest(`priority must be an integer between 0 and ${MAX_PRIORITY}`);
    }
    return parsed;
}

// --- enqueue ----------------------------------------------------------------

async function enqueue(type: CommandType, payload: Record<string, any>) {
    const commandId = ulid();
    const now = new Date().toISOString();

    const record: CommandRecord = {
        commandId,
        type,
        payload,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        ttl: epochSecondsFromNow(COMMAND_RETENTION_DAYS),
    };

    // The row is written before the enqueue so `GET /commands/{id}` can never
    // 404 for a command the agent is already working on. If the enqueue then
    // fails the caller gets a 500 and the row is left visibly `queued`.
    await ddb.put({ TableName: COMMANDS_TABLE, Item: record });

    const envelope: CommandEnvelope = { commandId, type, payload, enqueuedAt: now };
    await sqs.send(new SendMessageCommand({
        QueueUrl: COMMAND_QUEUE_URL,
        MessageBody: JSON.stringify(envelope),
    }));

    console.log(`Queued ${type} command ${commandId}`);
    return json(202, { commandId });
}
