import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Structurally what every AWS SDK v3 client accepts for `credentials`. */
export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

/**
 * Reads the agent's scoped AWS access key out of the macOS login Keychain, so no
 * long-lived credential sits in a plaintext file on disk (spec section 9).
 *
 * Store it with:
 *   security add-generic-password -U -s icloud-bridge-agent -a aws \
 *     -w '{"accessKeyId":"...","secretAccessKey":"..."}'
 */
export async function readAwsCredentials(service: string): Promise<AwsCredentials> {
    let stdout: string;
    try {
        ({ stdout } = await execFileAsync('security', [
            'find-generic-password', '-s', service, '-a', 'aws', '-w',
        ]));
    } catch (e) {
        throw new Error(
            `No Keychain item '${service}' (account 'aws'). Run scripts/icloud-bridge/store-agent-credentials.sh. (${(e as Error).message})`,
        );
    }

    if (!stdout.trim()) {
        // `security` exits 0 with empty output when the item exists but the caller
        // is outside the logged-in GUI session, which cannot be prompted. Running
        // under launchd (or from a normal terminal) is what fixes this.
        throw new Error(
            `Keychain item '${service}' exists but its value could not be read. ` +
            'The agent must run in the logged-in GUI session — start it via launchd, not from a detached shell.',
        );
    }

    let parsed: { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string };
    try {
        parsed = JSON.parse(stdout.trim());
    } catch {
        throw new Error(`Keychain item '${service}' is not valid JSON; expected {"accessKeyId":..,"secretAccessKey":..}`);
    }

    if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error(`Keychain item '${service}' is missing accessKeyId or secretAccessKey`);
    }

    return {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
        sessionToken: parsed.sessionToken,
    };
}
