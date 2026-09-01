import { createServer, type Server } from 'node:http';
import { logger } from '../../logger';

const log = logger('bb-webhook');

/**
 * Local receiver for BlueBubbles webhooks.
 *
 * Bound to loopback only. It is not authenticated, and does not need to be: it is
 * unreachable from outside the machine, and the security model already assumes any
 * local process could talk to BlueBubbles directly.
 */

export const WEBHOOK_PATH = '/bb-webhook';

/** BlueBubbles dispatches `{ type, data }` for every event it emits. */
export interface WebhookEvent {
    type: string;
    data: any;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export class WebhookListener {

    private server?: Server;

    constructor(
        private readonly host: string,
        private readonly port: number,
        private readonly onEvent: (event: WebhookEvent) => Promise<void>,
    ) { }

    async start(): Promise<void> {
        // Provider start-up is retried, so this must be safe to call again after a
        // later step (the ping, the backfill) failed.
        if (this.server?.listening) return;

        this.server = createServer((request, response) => {
            const path = (request.url ?? '').split('?')[0];
            if (request.method !== 'POST' || path !== WEBHOOK_PATH) {
                response.writeHead(404).end();
                return;
            }
            this.receive(request, response);
        });

        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(this.port, this.host, () => {
                log.info(`Listening for BlueBubbles webhooks on http://${this.host}:${this.port}${WEBHOOK_PATH}`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        if (!this.server) return;
        await new Promise<void>(resolve => this.server!.close(() => resolve()));
        log.info('Webhook listener stopped');
    }

    private receive(request: NodeJS.ReadableStream & { destroy(): void }, response: any) {
        const chunks: Buffer[] = [];
        let size = 0;

        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                response.writeHead(413).end();
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });

        request.on('end', () => {
            // Acknowledge before processing: BlueBubbles should never block or
            // retry because our push to AWS was slow.
            response.writeHead(204).end();

            let event: WebhookEvent;
            try {
                event = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            } catch (e) {
                log.warn('Discarding webhook with unparseable body', e);
                return;
            }

            this.onEvent(event).catch(e => log.error(`Failed to handle "${event.type}" webhook`, e));
        });
    }
}
