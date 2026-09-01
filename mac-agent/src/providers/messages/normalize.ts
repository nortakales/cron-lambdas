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
        dateRead: message.dateRead ? new Date(message.dateRead).toISOString() : undefined,
    };
}

/** A subject line is part of the message a human sees, so keep it with the body. */
function joinText(subject: string | null | undefined, text: string | null | undefined): string | undefined {
    const parts = [subject, text].filter((part): part is string => Boolean(part && part.length));
    return parts.length ? parts.join('\n') : undefined;
}
