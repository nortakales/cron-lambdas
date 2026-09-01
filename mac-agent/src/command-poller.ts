import {
    DeleteMessageCommand,
    ReceiveMessageCommand,
    type Message as SqsMessage,
} from '@aws-sdk/client-sqs';
import type { AwsClients } from './aws';
import type { AgentConfig } from './config';
import type { CommandEnvelope, CommandStatus, CommandType } from './contract';
import { logger } from './logger';
import type { Provider } from './providers/types';

const log = logger('commands');

/**
 * Write path: long-polls the command queue and executes each command against the
 * local Apple services.
 *
 * Long polling is what lets a home Mac behind NAT respond in near real time
 * without accepting a single inbound connection — the connection is always ours,
 * held open by SQS for up to 20 seconds at a time.
 */

/** SQS's maximum, and what makes this feel instant rather than polled. */
const WAIT_TIME_SECONDS = 20;
const MAX_MESSAGES_PER_RECEIVE = 5;
/** Backoff after an unexpected receive failure, so a broken loop cannot spin. */
const ERROR_BACKOFF_MILLIS = 5000;

/** Thrown when retrying could not possibly help, e.g. a malformed command. */
export class PermanentCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PermanentCommandError';
    }
}

export class CommandPoller {

    private readonly byCommandType = new Map<CommandType, Provider>();
    private readonly abort = new AbortController();
    private running = false;
    private loop?: Promise<void>;

    constructor(
        private readonly aws: AwsClients,
        private readonly config: AgentConfig,
        providers: Provider[],
    ) {
        for (const provider of providers) {
            for (const type of provider.commandTypes) {
                this.byCommandType.set(type, provider);
            }
        }
    }

    start() {
        this.running = true;
        this.loop = this.pollForever();
        log.info(`Polling ${this.config.commandQueueUrl} for [${[...this.byCommandType.keys()].join(', ')}]`);
    }

    async stop() {
        this.running = false;
        this.abort.abort();
        await this.loop;
        log.info('Command poller stopped');
    }

    private async pollForever(): Promise<void> {
        while (this.running) {
            try {
                const response = await this.aws.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: this.config.commandQueueUrl,
                        MaxNumberOfMessages: MAX_MESSAGES_PER_RECEIVE,
                        WaitTimeSeconds: WAIT_TIME_SECONDS,
                        // A message system attribute, not a queue attribute.
                        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
                    }),
                    { abortSignal: this.abort.signal },
                );

                for (const message of response.Messages ?? []) {
                    if (!this.running) break;
                    await this.handle(message);
                }
            } catch (e) {
                if (!this.running) return;
                log.error('Command receive failed; backing off', e);
                await sleep(ERROR_BACKOFF_MILLIS);
            }
        }
    }

    private async handle(message: SqsMessage): Promise<void> {
        let envelope: CommandEnvelope;
        try {
            envelope = JSON.parse(message.Body ?? '');
        } catch (e) {
            log.error('Deleting unparseable command message', e);
            await this.deleteMessage(message);
            return;
        }

        const attempts = Number(message.Attributes?.ApproximateReceiveCount ?? 1);
        const provider = this.byCommandType.get(envelope.type);

        try {
            if (!provider) {
                throw new PermanentCommandError(`No provider handles command type ${envelope.type}`);
            }

            await this.setStatus(envelope.commandId, 'picked_up', { attempts });
            const result = await provider.execute(envelope);

            await this.setStatus(envelope.commandId, 'done', { attempts, result });
            // Deleted only after the status write lands, so an at-least-once
            // redelivery can never leave a command silently unreported.
            await this.deleteMessage(message);
            log.info(`Command ${envelope.commandId} (${envelope.type}) done`);

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            await this.setStatus(envelope.commandId, 'failed', { attempts, error });

            if (e instanceof PermanentCommandError) {
                // Retrying cannot help, so take it off the queue rather than
                // burning five deliveries on the way to the DLQ.
                await this.deleteMessage(message);
                log.error(`Command ${envelope.commandId} rejected permanently: ${error}`);
            } else {
                // Left on the queue: SQS redelivers, and parks it on the DLQ once
                // maxReceiveCount is exhausted.
                log.error(`Command ${envelope.commandId} failed on attempt ${attempts}; leaving for redrive`, e);
            }
        }
    }

    private async setStatus(
        commandId: string,
        status: CommandStatus,
        extra: { attempts: number; result?: Record<string, unknown>; error?: string },
    ): Promise<void> {
        // `status` is a DynamoDB reserved word, hence the alias.
        const sets = ['#status = :status', 'updatedAt = :updatedAt', 'attempts = :attempts'];
        const removes: string[] = [];
        const names: Record<string, string> = { '#status': 'status' };
        const values: Record<string, unknown> = {
            ':status': status,
            ':updatedAt': new Date().toISOString(),
            ':attempts': extra.attempts,
        };

        if (extra.result !== undefined) {
            sets.push('#result = :result');
            names['#result'] = 'result';
            values[':result'] = extra.result;
        }

        if (extra.error !== undefined) {
            sets.push('#error = :error');
            names['#error'] = 'error';
            values[':error'] = extra.error;
        } else if (status === 'done') {
            // A command that failed once and then succeeded on redelivery would
            // otherwise report `done` alongside the stale error from the earlier
            // attempt, which reads like a failure to anyone polling the endpoint.
            removes.push('#error');
            names['#error'] = 'error';
        }

        const expression = `SET ${sets.join(', ')}` + (removes.length ? ` REMOVE ${removes.join(', ')}` : '');

        await this.aws.ddb.update({
            TableName: this.config.commandsTableName,
            Key: { commandId },
            UpdateExpression: expression,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
        });
    }

    private async deleteMessage(message: SqsMessage): Promise<void> {
        await this.aws.sqs.send(new DeleteMessageCommand({
            QueueUrl: this.config.commandQueueUrl,
            ReceiptHandle: message.ReceiptHandle!,
        }));
    }
}

function sleep(millis: number) {
    return new Promise(resolve => setTimeout(resolve, millis));
}
