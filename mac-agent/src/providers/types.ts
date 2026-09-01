import type { CommandEnvelope, CommandType } from '../contract';

/**
 * The provider model (spec section 16).
 *
 * Each Apple domain — Messages, Reminders, and later Calendar, Contacts, ... —
 * implements this one interface. The agent core (queue polling, event publishing,
 * checkpoints, heartbeat) never learns anything domain-specific, so adding a
 * domain means adding a provider and registering it.
 */
export interface Provider {

    /** Stable identifier, used in logs and checkpoint keys. */
    readonly name: string;

    /** Command types from the SQS envelope this provider knows how to execute. */
    readonly commandTypes: readonly CommandType[];

    /**
     * Begin observing the local source and pushing changes to AWS. Should return
     * once the provider is live; long-running work belongs on its own timers or
     * listeners.
     */
    start(): Promise<void>;

    /** Release listeners, child processes and timers. */
    stop(): Promise<void>;

    /**
     * Execute one queued command. The returned object is stored verbatim as the
     * command's `result`. Throwing marks the command failed and lets SQS redeliver.
     */
    execute(command: CommandEnvelope): Promise<Record<string, unknown>>;
}
