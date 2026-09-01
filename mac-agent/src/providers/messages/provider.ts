import type { AgentConfig } from '../../config';
import type { CommandEnvelope, CommandType, MessageInput } from '../../contract';
import { logger } from '../../logger';
import type { Publisher } from '../../publisher';
import { SyncState, SyncStateKey } from '../../sync-state';
import type { Provider } from '../types';
import { BlueBubblesClient } from './bluebubbles-client';
import { normalizeMessage } from './normalize';
import { WebhookListener, type WebhookEvent } from './webhook-listener';

const log = logger('messages');

/**
 * Messages provider: BlueBubbles webhooks in, `send_message` commands out.
 *
 * Read path is push-based, so it is effectively instant. On start-up the provider
 * also backfills anything that arrived while it was down, using the checkpoint in
 * `sync_state` — this is what makes a reboot or a crash non-lossy.
 */

/** BlueBubbles events that carry a message worth mirroring. */
const MESSAGE_EVENTS = new Set(['new-message', 'updated-message']);

const BACKFILL_PAGE_SIZE = 200;
/** Bounds a catch-up after a long outage so start-up cannot run away. */
const BACKFILL_MAX_PAGES = 25;
/** How far back a first run reaches when there is no checkpoint yet. */
const FIRST_RUN_LOOKBACK_MILLIS = 7 * 24 * 60 * 60 * 1000;

/**
 * Window over which inbound webhooks are coalesced before publishing. A single
 * message typically produces several webhooks in quick succession -- the message
 * itself, then delivery and read receipts as `updated-message` -- and BlueBubbles
 * can be configured to send every event type. Buffering briefly turns that burst
 * into one event carrying the final state, instead of one per receipt.
 */
const COALESCE_WINDOW_MILLIS = 400;
/** Flush early rather than let a busy period grow the buffer unbounded. */
const COALESCE_MAX_BATCH = 100;

export class MessagesProvider implements Provider {

    readonly name = 'messages';
    readonly commandTypes: readonly CommandType[] = ['send_message'];

    private readonly listener: WebhookListener;
    /** Event types already reported as ignored, so each is logged only once. */
    private readonly ignoredEventTypes = new Set<string>();
    /** Coalescing buffer, keyed by GUID so later receipts supersede earlier ones. */
    private readonly pending = new Map<string, MessageInput>();
    private flushTimer?: NodeJS.Timeout;

    constructor(
        config: AgentConfig,
        private readonly client: BlueBubblesClient,
        private readonly publisher: Publisher,
        private readonly syncState: SyncState,
    ) {
        this.listener = new WebhookListener(
            config.webhook.host,
            config.webhook.port,
            event => this.onWebhook(event),
        );
    }

    async start(): Promise<void> {
        await this.client.ping();
        // Listen before backfilling, so a message arriving mid-backfill is caught
        // by the webhook rather than falling in the gap.
        await this.listener.start();
        await this.backfill();
    }

    async stop(): Promise<void> {
        await this.listener.stop();
        // Publish anything still buffered rather than dropping it on shutdown.
        await this.flush().catch(e => log.error('Failed to flush buffered messages on shutdown', e));
    }

    async execute(command: CommandEnvelope): Promise<Record<string, unknown>> {
        if (command.type !== 'send_message') {
            throw new Error(`${this.name} provider cannot execute ${command.type}`);
        }

        const { chatGuid, text } = command.payload as { chatGuid: string; text: string };
        log.info(`Sending message to ${chatGuid} for command ${command.commandId}`);

        const sent = await this.client.sendText(chatGuid, text);

        // BlueBubbles also echoes our own message back over the webhook, but
        // publishing here means the mirror is current the moment the command
        // reports done. The ingest side is an upsert, so the echo is harmless.
        const normalized = normalizeMessage(sent, chatGuid);
        if (normalized) {
            await this.publisher.publishMessages([normalized]);
            await this.advanceCursor(normalized.createdAt);
        }

        return {
            messageGuid: sent.guid,
            chatGuid,
            sentAt: sent.dateCreated ? new Date(sent.dateCreated).toISOString() : undefined,
        };
    }

    // --- read path ----------------------------------------------------------

    private async onWebhook(event: WebhookEvent): Promise<void> {
        if (!MESSAGE_EVENTS.has(event.type)) {
            // BlueBubbles can be configured to send every event type; noting each
            // one once keeps that visible without flooding the log.
            if (!this.ignoredEventTypes.has(event.type)) {
                this.ignoredEventTypes.add(event.type);
                log.info(`Ignoring BlueBubbles "${event.type}" events (not a message type)`);
            }
            return;
        }

        const normalized = normalizeMessage(event.data);
        if (!normalized) {
            log.warn(`Discarding "${event.type}" webhook with no usable chat GUID or timestamp`);
            return;
        }

        this.enqueue(normalized);
    }

    /** Buffers a message, flushing on the debounce window or the size cap. */
    private enqueue(message: MessageInput) {
        // Keyed by GUID: a read receipt for a message already buffered replaces it
        // rather than publishing the same message twice.
        this.pending.set(message.messageGuid, message);

        // flush() rethrows so callers can react, but these two call sites are
        // fire-and-forget: an unhandled rejection here would take the process down,
        // and the buffered messages have already been put back for the next flush.
        if (this.pending.size >= COALESCE_MAX_BATCH) {
            this.flush().catch(e => log.error('Failed to publish coalesced messages', e));
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(
                () => this.flush().catch(e => log.error('Failed to publish coalesced messages', e)),
                COALESCE_WINDOW_MILLIS,
            );
            this.flushTimer.unref();
        }
    }

    private async flush(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        if (this.pending.size === 0) return;

        const batch = [...this.pending.values()];
        this.pending.clear();

        try {
            await this.publisher.publishMessages(batch);
        } catch (e) {
            // Put them back so the next flush retries. The checkpoint is not
            // advanced either, so a restart would re-backfill them regardless.
            for (const message of batch) {
                if (!this.pending.has(message.messageGuid)) this.pending.set(message.messageGuid, message);
            }
            throw e;
        }

        const newest = batch.reduce(
            (latest, message) => (message.createdAt > latest ? message.createdAt : latest),
            batch[0].createdAt,
        );
        await this.advanceCursor(newest);
    }

    /**
     * Replays anything BlueBubbles recorded while the agent was not listening.
     * Safe to run at every start: ingest keys on the message GUID, so re-pushing
     * a message already in DynamoDB simply overwrites it with itself.
     */
    private async backfill(): Promise<void> {
        const checkpoint = await this.syncState.get<string>(SyncStateKey.MESSAGES_CURSOR);
        const after = checkpoint
            ? Date.parse(checkpoint)
            : Date.now() - FIRST_RUN_LOOKBACK_MILLIS;

        log.info(
            checkpoint
                ? `Backfilling messages since checkpoint ${checkpoint}`
                : `No checkpoint found; backfilling the last ${FIRST_RUN_LOOKBACK_MILLIS / 86_400_000} days`,
        );

        let offset = 0;
        let newest = after;
        let total = 0;

        for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
            const messages = await this.client.queryMessages({
                after,
                limit: BACKFILL_PAGE_SIZE,
                offset,
            });
            if (messages.length === 0) break;

            const normalized = messages
                .map(message => normalizeMessage(message))
                .filter((message): message is MessageInput => message !== undefined);

            if (normalized.length) {
                await this.publisher.publishMessages(normalized);
                total += normalized.length;
                newest = Math.max(newest, ...normalized.map(message => Date.parse(message.createdAt)));
            }

            offset += messages.length;
            if (messages.length < BACKFILL_PAGE_SIZE) break;

            if (page === BACKFILL_MAX_PAGES - 1) {
                log.warn(`Backfill stopped at the ${BACKFILL_MAX_PAGES}-page cap; rerun to continue`);
            }
        }

        await this.syncState.set(SyncStateKey.MESSAGES_CURSOR, new Date(newest).toISOString());
        log.info(`Backfill complete: ${total} message(s), checkpoint now ${new Date(newest).toISOString()}`);
    }

    /** The checkpoint only ever moves forward, so out-of-order events cannot rewind it. */
    private async advanceCursor(createdAt: string): Promise<void> {
        const current = await this.syncState.get<string>(SyncStateKey.MESSAGES_CURSOR);
        if (!current || Date.parse(createdAt) > Date.parse(current)) {
            await this.syncState.setQuietly(SyncStateKey.MESSAGES_CURSOR, createdAt);
        }
    }
}
