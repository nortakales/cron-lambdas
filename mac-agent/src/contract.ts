/**
 * The wire contract between this agent and AWS.
 *
 * These shapes mirror `src/lambda/icloud-bridge/shared/model.ts`, which is the
 * source of truth. They are duplicated rather than imported because the agent is
 * a separate package with its own tsconfig and is deliberately excluded from the
 * CDK/Lambda build. Change them together.
 */

export const AGENT_EVENT_SOURCE = 'icloud-bridge.agent';

export const IngestDetailType = {
    MESSAGE_UPSERTED: 'message.upserted',
    REMINDER_UPSERTED: 'reminder.upserted',
    REMINDER_DELETED: 'reminder.deleted',
    REMINDER_LISTS_SNAPSHOT: 'reminder-lists.snapshot',
} as const;

export interface Attachment {
    guid: string;
    name?: string;
    mimeType?: string;
    totalBytes?: number;
}

export interface MessageInput {
    chatGuid: string;
    messageGuid: string;
    text?: string;
    sender?: string;
    isFromMe: boolean;
    service?: string;
    chatName?: string;
    attachments?: Attachment[];
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
    appleLastModified?: string;
}

export interface ReminderListInput {
    listId: string;
    listName: string;
    isDefault?: boolean;
    /** Owning account, e.g. "iCloud" or "On My Mac". */
    sourceName?: string;
    /** True for a local-only list, which never syncs to other devices. */
    isLocal?: boolean;
}

export type CommandType =
    | 'send_message'
    | 'add_reminder'
    | 'complete_reminder'
    | 'update_reminder';

export type CommandStatus = 'queued' | 'picked_up' | 'done' | 'failed';

export interface CommandEnvelope {
    commandId: string;
    type: CommandType;
    payload: Record<string, any>;
    enqueuedAt: string;
}
