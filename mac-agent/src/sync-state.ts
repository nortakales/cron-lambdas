import type { AwsClients } from './aws';
import type { AgentConfig } from './config';
import { logger } from './logger';

const log = logger('sync-state');

/**
 * Restart-safety checkpoints (spec section 10). Small, infrequently written
 * values that let the agent resume where it left off after a crash, a reboot or
 * a macOS update: how far the message backfill got, and the last reminder
 * snapshot to diff against.
 */

export const SyncStateKey = {
    MESSAGES_CURSOR: 'messages_cursor',
    REMINDERS_SNAPSHOT: 'reminders_snapshot',
    HEARTBEAT: 'heartbeat',
} as const;

export class SyncState {

    constructor(private readonly aws: AwsClients, private readonly config: AgentConfig) { }

    async get<T>(key: string): Promise<T | undefined> {
        const result = await this.aws.ddb.get({
            TableName: this.config.syncStateTableName,
            Key: { stateKey: key },
            // Checkpoints are only useful when current, so pay for a strong read.
            ConsistentRead: true,
        });
        return result.Item?.value as T | undefined;
    }

    async set(key: string, value: unknown): Promise<void> {
        await this.aws.ddb.put({
            TableName: this.config.syncStateTableName,
            Item: {
                stateKey: key,
                value,
                updatedAt: new Date().toISOString(),
            },
        });
    }

    /** Best-effort: a failed checkpoint should never take the agent down. */
    async setQuietly(key: string, value: unknown): Promise<void> {
        try {
            await this.set(key, value);
        } catch (e) {
            log.warn(`Could not checkpoint ${key}`, e);
        }
    }
}
