/**
 * Shared domain model for the iCloud Bridge.
 *
 * Everything the Mac agent pushes up (read path) and everything consumers send
 * down (write path) is described here, so the Lambdas, the agent and the MCP
 * server all agree on one shape.
 */

/** EventBridge `source` used by every event the Mac agent publishes. */
export const AGENT_EVENT_SOURCE = 'icloud-bridge.agent';

/** EventBridge `detail-type` values on the ingest bus. */
export const IngestDetailType = {
    MESSAGE_UPSERTED: 'message.upserted',
    REMINDER_UPSERTED: 'reminder.upserted',
    REMINDER_DELETED: 'reminder.deleted',
    REMINDER_LISTS_SNAPSHOT: 'reminder-lists.snapshot',
} as const;

export type IngestDetailType = typeof IngestDetailType[keyof typeof IngestDetailType];

/**
 * Constant partition key for the messages timeline GSI. All messages share it so
 * `GET /messages` (no chatId) is a single descending query instead of a scan. At
 * personal message volume the hot-partition tradeoff is irrelevant.
 */
export const MESSAGE_TIMELINE_KEY = 'MSG';

/**
 * Reserved `listId` partition in the reminders table holding the list registry
 * (one item per Reminders list, so we know a list's name even when it is empty).
 */
export const LIST_REGISTRY_PARTITION = '__lists__';

/** Sorts undated reminders last in the due-date GSI while keeping them present. */
export const NO_DUE_DATE_SORT = '9999-12-31T23:59:59.999Z';

export interface Attachment {
    guid: string;
    name?: string;
    mimeType?: string;
    totalBytes?: number;
}

/** A row in the `messages` table. */
export interface MessageRecord {
    /** PK. The BlueBubbles chat GUID, e.g. `iMessage;-;+15551234567`. */
    chatId: string;
    /** SK. `${createdAt}#${messageGuid}` — ISO8601 sorts lexicographically. */
    tsGuid: string;
    messageGuid: string;
    text?: string;
    /** Handle of the sender (address/phone). Absent on messages we sent. */
    sender?: string;
    isFromMe: boolean;
    service?: string;
    chatName?: string;
    attachments?: Attachment[];
    createdAt: string;
    updatedAt?: string;
    dateRead?: string;
    /** GSI PK, always MESSAGE_TIMELINE_KEY. */
    timelineKey: string;
    /** GSI PK for the sender index; falls back to `me` for outgoing messages. */
    senderKey: string;
    /** Epoch seconds. DynamoDB TTL enforces the retention window. */
    ttl: number;
}

/** A row in the `reminders` table. */
export interface ReminderRecord {
    /** PK. EventKit calendar identifier of the owning list. */
    listId: string;
    /** SK. EventKit calendar-item identifier. */
    reminderId: string;
    title: string;
    notes?: string;
    completed: boolean;
    /** GSI PK. Stringified `completed`, because GSI keys cannot be boolean. */
    completedKey: 'true' | 'false';
    dueDate?: string;
    /** GSI SK. `dueDate` or NO_DUE_DATE_SORT so undated reminders stay indexed. */
    dueSort: string;
    priority?: number;
    listName?: string;
    completionDate?: string;
    updatedAt: string;
    appleLastModified?: string;
}

/** A row in the reserved LIST_REGISTRY_PARTITION of the reminders table. */
export interface ReminderListRecord {
    listId: typeof LIST_REGISTRY_PARTITION;
    reminderId: string;
    listName: string;
    isDefault?: boolean;
    /** Owning account, e.g. "iCloud" or "On My Mac". */
    sourceName?: string;
    /** True for a local-only list, which never syncs to other devices. */
    isLocal?: boolean;
    updatedAt: string;
}

export type CommandType =
    | 'send_message'
    | 'add_reminder'
    | 'complete_reminder'
    | 'update_reminder';

export type CommandStatus = 'queued' | 'picked_up' | 'done' | 'failed';

/** A row in the `commands` table. */
export interface CommandRecord {
    /** PK. ULID, so command ids sort by creation time. */
    commandId: string;
    type: CommandType;
    payload: Record<string, any>;
    status: CommandStatus;
    result?: Record<string, any>;
    error?: string;
    attempts?: number;
    createdAt: string;
    updatedAt: string;
    ttl: number;
}

/** The SQS message body the Mac agent consumes (spec section 8). */
export interface CommandEnvelope {
    commandId: string;
    type: CommandType;
    payload: Record<string, any>;
    enqueuedAt: string;
}

export function messageSortKey(createdAt: string, messageGuid: string) {
    return `${createdAt}#${messageGuid}`;
}

export function epochSecondsFromNow(days: number) {
    return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

// ---------------------------------------------------------------------------
// Ingest payloads — what the Mac agent pushes onto the EventBridge bus.
//
// Events carry an array even for a single item so that a cold-start backfill of
// hundreds of messages costs a handful of PutEvents calls instead of hundreds.
// The agent is responsible for chunking to stay under EventBridge's 256KB entry
// limit.
//
// mac-agent/ mirrors these shapes in its own contract module; this file is the
// source of truth.
// ---------------------------------------------------------------------------

export interface MessageInput {
    /** BlueBubbles chat GUID; becomes the `chatId` partition key. */
    chatGuid: string;
    messageGuid: string;
    text?: string;
    sender?: string;
    isFromMe: boolean;
    service?: string;
    chatName?: string;
    attachments?: Attachment[];
    /** ISO8601. */
    createdAt: string;
    updatedAt?: string;
    dateRead?: string;
}

export interface ReminderInput {
    listId: string;
    listName?: string;
    reminderId: string;
    title: string;
    notes?: string;
    completed: boolean;
    dueDate?: string;
    priority?: number;
    completionDate?: string;
    /** EventKit's lastModifiedDate; used to drop out-of-order updates. */
    appleLastModified?: string;
}

export interface MessageUpsertedDetail {
    messages: MessageInput[];
}

export interface ReminderUpsertedDetail {
    reminders: ReminderInput[];
}

export interface ReminderDeletedDetail {
    deleted: { listId: string; reminderId: string }[];
}

export interface ReminderListsSnapshotDetail {
    lists: {
        listId: string;
        listName: string;
        isDefault?: boolean;
        sourceName?: string;
        isLocal?: boolean;
    }[];
}

export function toMessageRecord(input: MessageInput, retentionDays: number): MessageRecord {
    const createdAt = new Date(input.createdAt).toISOString();
    return {
        chatId: input.chatGuid,
        tsGuid: messageSortKey(createdAt, input.messageGuid),
        messageGuid: input.messageGuid,
        text: input.text,
        sender: input.sender,
        isFromMe: input.isFromMe,
        service: input.service,
        chatName: input.chatName,
        attachments: input.attachments,
        createdAt,
        updatedAt: input.updatedAt,
        dateRead: input.dateRead,
        timelineKey: MESSAGE_TIMELINE_KEY,
        senderKey: input.isFromMe ? 'me' : (input.sender ?? 'unknown'),
        ttl: epochSecondsFromNow(retentionDays),
    };
}

export function toReminderRecord(input: ReminderInput): ReminderRecord {
    return {
        listId: input.listId,
        reminderId: input.reminderId,
        title: input.title,
        notes: input.notes,
        completed: input.completed,
        completedKey: input.completed ? 'true' : 'false',
        dueDate: input.dueDate,
        dueSort: input.dueDate ?? NO_DUE_DATE_SORT,
        priority: input.priority,
        listName: input.listName,
        completionDate: input.completionDate,
        updatedAt: new Date().toISOString(),
        appleLastModified: input.appleLastModified,
    };
}
