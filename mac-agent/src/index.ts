import { AwsClients } from './aws';
import { CommandPoller } from './command-poller';
import { loadConfig } from './config';
import { Heartbeat } from './heartbeat';
import { logger } from './logger';
import { Publisher } from './publisher';
import { SyncState } from './sync-state';
import { BlueBubblesClient } from './providers/messages/bluebubbles-client';
import { MessagesProvider } from './providers/messages/provider';
import { RemindersHelperClient } from './providers/reminders/helper-client';
import { RemindersProvider } from './providers/reminders/provider';
import type { Provider } from './providers/types';

const log = logger('agent');

/**
 * iCloud bridge Mac agent.
 *
 * Runs as a launchd LaunchAgent in the logged-in GUI session (AppleScript sending
 * requires it). Makes only outbound connections: publishes local changes to
 * EventBridge, long-polls SQS for commands, and reports their status to DynamoDB.
 */
async function main() {
    const config = loadConfig();
    log.info(`Starting agent against ${config.region}, bus ${config.eventBusName}`);

    const aws = await AwsClients.create(config);
    const publisher = new Publisher(aws, config);
    const syncState = new SyncState(aws, config);

    const blueBubbles = new BlueBubblesClient(
        config.blueBubbles.url,
        await aws.getSecretString(config.blueBubbles.passwordSecret),
    );

    // Registering a provider is the whole cost of adding a domain; the poller and
    // publisher below stay untouched.
    const providers: Provider[] = [
        new MessagesProvider(config, blueBubbles, publisher, syncState),
    ];

    if (config.reminders.enabled) {
        providers.push(new RemindersProvider(
            new RemindersHelperClient(config.reminders.helperPath),
            publisher,
            syncState,
        ));
    } else {
        log.warn(`Reminders provider disabled: no helper at ${config.reminders.helperPath}`);
    }

    const heartbeat = new Heartbeat(aws, config, syncState);
    const poller = new CommandPoller(aws, config, providers);

    // Started independently and retried in the background: a provider whose local
    // service is down (BlueBubbles restarting, Reminders permission not yet
    // granted) must not take down the queue poller, the heartbeat, or the other
    // providers. The heartbeat is what makes the difference visible — "agent up,
    // one provider degraded" reads very differently from "agent gone".
    for (const provider of providers) {
        void startWithRetry(provider);
    }
    poller.start();
    heartbeat.start();

    log.info('Agent running');

    await shutdownOnSignal(async () => {
        log.info('Shutting down');
        heartbeat.stop();
        await poller.stop();
        for (const provider of providers) {
            await provider.stop().catch(e => log.warn(`Provider "${provider.name}" failed to stop cleanly`, e));
        }
    });
}

/** Backoff bounds for a provider whose local dependency is not up yet. */
const PROVIDER_RETRY_BASE_MILLIS = 15_000;
const PROVIDER_RETRY_MAX_MILLIS = 5 * 60_000;

async function startWithRetry(provider: Provider, attempt = 1): Promise<void> {
    try {
        await provider.start();
        log.info(`Provider "${provider.name}" started`);
    } catch (e) {
        const delay = Math.min(PROVIDER_RETRY_BASE_MILLIS * attempt, PROVIDER_RETRY_MAX_MILLIS);
        log.error(`Provider "${provider.name}" failed to start (attempt ${attempt}); retrying in ${delay / 1000}s`, e);
        setTimeout(() => void startWithRetry(provider, attempt + 1), delay).unref();
    }
}

/** Resolves once launchd (or a terminal) asks the agent to exit. */
function shutdownOnSignal(onShutdown: () => Promise<void>): Promise<void> {
    return new Promise(resolve => {
        let shuttingDown = false;
        const handle = (signal: NodeJS.Signals) => {
            if (shuttingDown) return;
            shuttingDown = true;
            log.info(`Received ${signal}`);
            onShutdown().then(resolve, e => {
                log.error('Shutdown failed', e);
                resolve();
            });
        };
        process.on('SIGTERM', handle);
        process.on('SIGINT', handle);
    });
}

main().then(
    () => {
        log.info('Agent stopped');
        process.exit(0);
    },
    e => {
        // launchd restarts the agent on a non-zero exit (KeepAlive in the plist).
        log.error('Agent failed to start', e);
        process.exit(1);
    },
);
