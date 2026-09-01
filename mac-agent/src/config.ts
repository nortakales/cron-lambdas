import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Agent configuration.
 *
 * Kept in a JSON file rather than launchd environment variables so the plist
 * stays short and `scripts/setup-agent-config.sh` can regenerate it from the
 * deployed CloudFormation outputs. No secrets live here: AWS credentials come
 * from the Keychain, the BlueBubbles password from Secrets Manager.
 */

export const DEFAULT_CONFIG_PATH = join(homedir(), '.icloud-bridge', 'agent.json');

export interface AgentConfig {
    region: string;
    eventBusName: string;
    commandQueueUrl: string;
    commandsTableName: string;
    syncStateTableName: string;
    metricNamespace: string;
    blueBubbles: {
        /** Always a loopback address; BlueBubbles is never exposed off the Mac. */
        url: string;
        passwordSecret: string;
    };
    webhook: {
        host: string;
        port: number;
    };
    reminders: {
        /**
         * Defaults to whether the Swift helper has been built, so Messages works
         * on its own before the Reminders phase is finished.
         */
        enabled: boolean;
        helperPath: string;
        /**
         * Completed reminders whose completion is older than this are not
         * mirrored. Open reminders are never aged out regardless of age. Set to 0
         * to mirror everything.
         */
        completedRetentionDays: number;
    };
    /** Keychain generic-password service name holding the agent's access key. */
    keychainService: string;
}

/** Where swift-helper/build.sh puts the binary, relative to the compiled agent. */
const DEFAULT_HELPER_PATH = join(__dirname, '..', 'swift-helper', 'out', 'reminders-helper');

/**
 * 18 months. Chosen to clear an annual recurring reminder by a wide margin: the
 * most recent completed occurrence of a yearly reminder is at most ~12 months
 * old, so this never truncates a live recurrence series.
 */
const DEFAULT_COMPLETED_RETENTION_DAYS = 548;

const REQUIRED_KEYS: (keyof AgentConfig)[] = [
    'region',
    'eventBusName',
    'commandQueueUrl',
    'commandsTableName',
    'syncStateTableName',
];

export function loadConfig(path = process.env.ICLOUD_BRIDGE_CONFIG ?? DEFAULT_CONFIG_PATH): AgentConfig {
    let raw: string;
    try {
        raw = readFileSync(path, 'utf-8');
    } catch (e) {
        throw new Error(
            `Could not read agent config at ${path}. Run scripts/setup-agent-config.sh to generate it. (${(e as Error).message})`,
        );
    }

    const parsed = JSON.parse(raw) as Partial<AgentConfig>;

    const config: AgentConfig = {
        region: parsed.region!,
        eventBusName: parsed.eventBusName!,
        commandQueueUrl: parsed.commandQueueUrl!,
        commandsTableName: parsed.commandsTableName!,
        syncStateTableName: parsed.syncStateTableName!,
        metricNamespace: parsed.metricNamespace ?? 'IcloudBridge',
        blueBubbles: {
            url: parsed.blueBubbles?.url ?? 'http://127.0.0.1:1234',
            passwordSecret: parsed.blueBubbles?.passwordSecret ?? 'icloud-bridge-bluebubbles-password',
        },
        webhook: {
            host: parsed.webhook?.host ?? '127.0.0.1',
            port: parsed.webhook?.port ?? 4000,
        },
        reminders: {
            helperPath: parsed.reminders?.helperPath ?? DEFAULT_HELPER_PATH,
            enabled: parsed.reminders?.enabled ?? false,
            completedRetentionDays:
                parsed.reminders?.completedRetentionDays ?? DEFAULT_COMPLETED_RETENTION_DAYS,
        },
        keychainService: parsed.keychainService ?? 'icloud-bridge-agent',
    };

    // Absent `enabled` means "on once the helper exists", so Phase 3 needs no
    // config edit — building the binary is enough.
    if (parsed.reminders?.enabled === undefined) {
        config.reminders.enabled = existsSync(config.reminders.helperPath);
    }

    const missing = REQUIRED_KEYS.filter(key => !config[key]);
    if (missing.length) {
        throw new Error(`Agent config at ${path} is missing: ${missing.join(', ')}`);
    }
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.blueBubbles.url)) {
        // A non-loopback URL would mean BlueBubbles is reachable off the Mac,
        // which the whole security model assumes is impossible.
        throw new Error(`blueBubbles.url must point at loopback, got ${config.blueBubbles.url}`);
    }

    return config;
}
