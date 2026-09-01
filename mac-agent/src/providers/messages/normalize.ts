import type { MessageInput } from '../../contract';
import type { BlueBubblesMessage } from './bluebubbles-client';

/**
 * Converts BlueBubbles' message shape into the bridge's wire contract.
 *
 * Returns undefined for anything unusable — a message with no chat or no
 * timestamp cannot be keyed in DynamoDB, and is dropped rather than poisoning the
 * ingest event.
 */
export function normalizeMessage(
    message: BlueBubblesMessage,
    fallbackChatGuid?: string,
): MessageInput | undefined {

    const chatGuid = message.chats?.[0]?.guid ?? fallbackChatGuid;
    if (!chatGuid || !message.guid || !message.dateCreated) {
        return undefined;
    }

    return {
        chatGuid,
        messageGuid: message.guid,
        // BlueBubbles has already decoded `attributedBody`, which on modern macOS
        // is where the text of many messages actually lives.
        text: joinText(message.subject, message.text),
        sender: message.handle?.address ?? undefined,
        isFromMe: Boolean(message.isFromMe),
        // Chat GUIDs are `<service>;<type>;<address>`, e.g. `iMessage;-;+15551234567`.
        service: chatGuid.split(';')[0] || undefined,
        chatName: message.chats?.[0]?.displayName ?? message.chats?.[0]?.chatIdentifier ?? undefined,
        attachments: message.attachments?.map(attachment => ({
            guid: attachment.guid,
            name: attachment.transferName,
            mimeType: attachment.mimeType,
            totalBytes: attachment.totalBytes,
        })),
        createdAt: new Date(message.dateCreated).toISOString(),
        dateRead: epoch(message.dateRead),
        dateDelivered: epoch(message.dateDelivered),
        dateEdited: epoch(message.dateEdited),
        dateRetracted: epoch(message.dateRetracted),
        datePlayed: epoch(message.datePlayed),
        reaction: normalizeReaction(message),
        // An inline reply; `threadOriginatorGuid` is the head of a longer thread.
        replyToGuid: stripPartPrefix(message.replyToGuid) ?? undefined,
        threadOriginatorGuid: stripPartPrefix(message.threadOriginatorGuid) ?? undefined,
        expressiveSendStyleId: message.expressiveSendStyleId ?? undefined,
        balloonBundleId: message.balloonBundleId ?? undefined,
        isAudioMessage: message.isAudioMessage || undefined,
        isSpam: message.isSpam || undefined,
        // itemType 0 is an ordinary message; anything else is a system event such
        // as a group rename, so it is only carried when meaningful.
        itemType: message.itemType || undefined,
        groupActionType: message.groupActionType || undefined,
        groupTitle: message.groupTitle ?? undefined,
    };
}

/**
 * Turns a tapback into something a client can attach to its target.
 *
 * Reactions arrive as ordinary messages whose text is prose ("Liked ..."), so
 * without this a dashboard renders them as chat lines instead of badges.
 * BlueBubbles signals a removed reaction with a leading "-" on the type.
 */
function normalizeReaction(message: BlueBubblesMessage) {
    const type = message.associatedMessageType;
    if (!type) return undefined;

    const targetGuid = stripPartPrefix(message.associatedMessageGuid);
    if (!targetGuid) return undefined;

    const removed = type.startsWith('-');
    return {
        type: removed ? type.slice(1) : type,
        removed,
        targetGuid,
        targetPart: partIndex(message.associatedMessageGuid),
    };
}

/** `p:0/ABC-123` -> `ABC-123`. Also tolerates the `bp:` form and a bare GUID. */
function stripPartPrefix(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const match = /^(?:p:\d+\/|bp:)?(.+)$/.exec(value);
    return match ? match[1] : value;
}

function partIndex(value: string | null | undefined): number | undefined {
    const match = value ? /^p:(\d+)\//.exec(value) : null;
    return match ? Number(match[1]) : undefined;
}

function epoch(value: number | null | undefined): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
}

/** A subject line is part of the message a human sees, so keep it with the body. */
function joinText(subject: string | null | undefined, text: string | null | undefined): string | undefined {
    const parts = [subject, text].filter((part): part is string => Boolean(part && part.length));
    return parts.length ? parts.join('\n') : undefined;
}
