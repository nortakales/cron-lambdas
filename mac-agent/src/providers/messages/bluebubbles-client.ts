import { randomUUID } from 'node:crypto';
import { logger } from '../../logger';

const log = logger('bluebubbles');

/**
 * Client for the BlueBubbles server running on this Mac.
 *
 * Authentication is a `?password=` query parameter — BlueBubbles' auth middleware
 * accepts the password only from the query string (`guid`/`password`/`token`), with
 * no header form. That is a deliberate exception to the project's "no secrets in
 * URLs" rule, tolerable because every request goes to loopback and never leaves
 * the machine.
 */

/** Shape of the message objects BlueBubbles' MessageSerializer returns. */
export interface BlueBubblesMessage {
    guid: string;
    /** Already resolved from `attributedBody` on modern macOS by BlueBubbles. */
    text: string | null;
    subject?: string | null;
    handle?: { address?: string } | null;
    chats?: { guid: string; chatIdentifier?: string; displayName?: string }[];
    attachments?: { guid: string; mimeType?: string; transferName?: string; totalBytes?: number }[];
    /** Epoch milliseconds. */
    dateCreated: number | null;
    dateRead?: number | null;
    dateDelivered?: number | null;
    dateEdited?: number | null;
    dateRetracted?: number | null;
    datePlayed?: number | null;
    isFromMe: boolean;
    /** Reaction kind, e.g. "like"; a "-" prefix means the reaction was removed. */
    associatedMessageType?: string | null;
    /** Target of a reaction, in `p:<part>/<guid>` form. */
    associatedMessageGuid?: string | null;
    /** Set when this message is an inline reply. */
    replyToGuid?: string | null;
    threadOriginatorGuid?: string | null;
    expressiveSendStyleId?: string | null;
    /** Identifies rich payloads: link previews, Apple Pay, app messages. */
    balloonBundleId?: string | null;
    isAudioMessage?: boolean;
    isSpam?: boolean;
    /** Non-zero for system events such as a group rename or a join/leave. */
    itemType?: number;
    groupActionType?: number;
    groupTitle?: string | null;
}

export interface QueryOptions {
    chatGuid?: string;
    /** Epoch milliseconds; returns messages created after this instant. */
    after?: number;
    limit?: number;
    offset?: number;
}

export class BlueBubblesClient {

    constructor(private readonly baseUrl: string, private readonly password: string) { }

    /** Liveness check; also the Phase 0 `bb ping` checkpoint. */
    async ping(): Promise<void> {
        await this.request('GET', '/api/v1/ping');
        log.info(`BlueBubbles reachable at ${this.baseUrl}`);
    }

    async sendText(chatGuid: string, text: string): Promise<BlueBubblesMessage> {
        // BlueBubbles tracks in-flight sends by tempGuid so it can correlate the
        // webhook echo of our own message with this request.
        const tempGuid = randomUUID();
        return await this.request<BlueBubblesMessage>('POST', '/api/v1/message/text', {
            chatGuid,
            message: text,
            tempGuid,
            // AppleScript is the universally available path; the Private API
            // variant needs a separate helper install.
            method: 'apple-script',
        });
    }

    async queryMessages(options: QueryOptions): Promise<BlueBubblesMessage[]> {
        return await this.request<BlueBubblesMessage[]>('POST', '/api/v1/message/query', {
            chatGuid: options.chatGuid,
            after: options.after,
            limit: options.limit ?? 100,
            offset: options.offset ?? 0,
            // Without these the response carries no chat GUID or attachment list.
            with: ['chat', 'attachment'],
        });
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const url = new URL(path, this.baseUrl);
        url.searchParams.set('password', this.password);

        const response = await fetch(url, {
            method,
            headers: body === undefined ? {} : { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        });

        const raw = await response.text();
        if (!response.ok) {
            // The password never appears here: `path` is the un-templated route.
            throw new Error(`BlueBubbles ${method} ${path} failed: ${response.status} ${raw.slice(0, 500)}`);
        }

        // Every BlueBubbles response is wrapped as { status, message, data }.
        const parsed = JSON.parse(raw) as { data?: T; message?: string };
        return parsed.data as T;
    }
}
