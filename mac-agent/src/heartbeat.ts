import { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { AwsClients } from './aws';
import type { AgentConfig } from './config';
import { logger } from './logger';
import { SyncState, SyncStateKey } from './sync-state';

const log = logger('heartbeat');

/**
 * Liveness signal. The agent lives on a Mac at home that AWS cannot reach, so the
 * only way to know it is running is for it to say so: a CloudWatch metric every
 * interval, alarmed on missing data, plus a `sync_state` row a human can read.
 */

const METRIC_NAME = 'AgentHeartbeat';
export const HEARTBEAT_INTERVAL_MILLIS = 60 * 1000;

export class Heartbeat {

    private timer?: NodeJS.Timeout;

    constructor(
        private readonly aws: AwsClients,
        private readonly config: AgentConfig,
        private readonly syncState: SyncState,
    ) { }

    start() {
        this.timer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MILLIS);
        // Don't hold the event loop open on shutdown.
        this.timer.unref();
        void this.beat();
        log.info(`Heartbeat started at ${HEARTBEAT_INTERVAL_MILLIS / 1000}s intervals`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    private async beat() {
        try {
            await this.aws.cloudwatch.send(new PutMetricDataCommand({
                Namespace: this.config.metricNamespace,
                MetricData: [{
                    MetricName: METRIC_NAME,
                    Value: 1,
                    Unit: 'Count',
                    Timestamp: new Date(),
                }],
            }));
        } catch (e) {
            // A network blip must not kill the process; the alarm exists precisely
            // to notice if this keeps failing.
            log.warn('Could not publish heartbeat metric', e);
        }

        await this.syncState.setQuietly(SyncStateKey.HEARTBEAT, {
            at: new Date().toISOString(),
            pid: process.pid,
        });
    }
}
