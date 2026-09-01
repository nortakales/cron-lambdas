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

export interface Reaction {
    /** e.g. "like", "love", "laugh", "emphasize", "dislike", "question". */
    type: string;
    /** True when the reaction was taken back rather than added. */
    removed: boolean;
    /** GUID of the message being reacted to. */
    targetGuid: string;
    /** Which part of a multi-part message, when the target is subdivided. */
    targetPart?: number;
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
    dateDelivered?: string;
    dateEdited?: string;
    dateRetracted?: string;
    datePlayed?: string;
    /** Present when this message is a tapback rather than a chat message. */
    reaction?: Reaction;
    /** GUID of the message this one replies to inline. */
    replyToGuid?: string;
    threadOriginatorGuid?: string;
    expressiveSendStyleId?: string;
    /** Identifies rich payloads: link previews, Apple Pay, app messages. */
    balloonBundleId?: string;
    isAudioMessage?: boolean;
    isSpam?: boolean;
    /** Non-zero for system events such as a group rename or a join/leave. */
    itemType?: number;
    groupActionType?: number;
    groupTitle?: string;
}

export interface RecurrenceRule {
    /** daily | weekly | monthly | yearly */
    frequency: string;
    /** Every N periods; 1 means "every week" for a weekly rule. */
    interval: number;
    /** e.g. ["monday"], or ["+1monday"] / ["-1friday"] for ordinal patterns. */
    daysOfTheWeek?: string[];
    daysOfTheMonth?: number[];
    monthsOfTheYear?: number[];
    weeksOfTheYear?: number[];
    daysOfTheYear?: number[];
    setPositions?: number[];
    /** Set when the series ends on a date. */
    endDate?: string;
    /** Set when the series ends after a number of occurrences. */
    occurrenceCount?: number;
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
    startDate?: string;
    url?: string;
    creationDate?: string;
    /** Recurrence rules, when the reminder repeats. */
    recurrence?: RecurrenceRule[];
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
