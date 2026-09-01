import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { logger } from '../../logger';

const log = logger('reminders-helper');

/**
 * Wrapper around the Swift `reminders-helper` binary.
 *
 * Two shapes of use: a long-running `observe` child that emits an NDJSON snapshot
 * whenever EventKit reports a change, and short-lived `exec` invocations that
 * apply a single mutation.
 */

export interface HelperReminder {
    reminderId: string;
    listId: string;
    listName: string;
    title: string;
    notes?: string | null;
    completed: boolean;
    completionDate?: string | null;
    dueDate?: string | null;
    priority: number;
    appleLastModified?: string | null;
}

export interface HelperList {
    listId: string;
    listName: string;
    isDefault: boolean;
}

export interface HelperSnapshot {
    type: 'snapshot';
    lists: HelperList[];
    reminders: HelperReminder[];
    capturedAt: string;
}

interface HelperResult {
    ok: boolean;
    data?: Record<string, string>;
    error?: string;
}

/** Delay before respawning a dead observer, so a broken binary cannot spin. */
const RESTART_DELAY_MILLIS = 5000;
const EXEC_TIMEOUT_MILLIS = 30_000;

export class RemindersHelperClient {

    private observer?: ChildProcess;
    private stopping = false;

    constructor(private readonly binaryPath: string) { }

    /**
     * Starts the observer and invokes `onSnapshot` for every snapshot it emits.
     * The child is respawned if it dies: a Reminders app restart or a revoked and
     * re-granted permission can take it down.
     */
    startObserving(onSnapshot: (snapshot: HelperSnapshot) => Promise<void>) {
        if (this.stopping) return;

        const child = spawn(this.binaryPath, ['observe'], { stdio: ['ignore', 'pipe', 'pipe'] });
        this.observer = child;

        createInterface({ input: child.stdout! }).on('line', line => {
            if (!line.trim()) return;
            let snapshot: HelperSnapshot;
            try {
                snapshot = JSON.parse(line);
            } catch {
                log.warn(`Ignoring unparseable observer output: ${line.slice(0, 200)}`);
                return;
            }
            if (snapshot.type !== 'snapshot') return;
            onSnapshot(snapshot).catch(e => log.error('Failed to handle reminders snapshot', e));
        });

        createInterface({ input: child.stderr! }).on('line', line => {
            if (line.trim()) log.warn(`helper stderr: ${line}`);
        });

        child.on('exit', (code, signal) => {
            if (this.stopping) return;
            log.error(`Observer exited (code ${code}, signal ${signal}); restarting in ${RESTART_DELAY_MILLIS}ms`);
            setTimeout(() => this.startObserving(onSnapshot), RESTART_DELAY_MILLIS).unref();
        });

        log.info(`Observing Reminders via ${this.binaryPath}`);
    }

    stopObserving() {
        this.stopping = true;
        this.observer?.kill('SIGTERM');
        this.observer = undefined;
    }

    /** Runs one mutation through a fresh `exec` invocation. */
    async exec(command: Record<string, unknown>): Promise<Record<string, string>> {
        const output = await this.runExec(command);

        let parsed: HelperResult;
        try {
            parsed = JSON.parse(lastLine(output));
        } catch {
            throw new Error(`reminders-helper returned unparseable output: ${output.slice(0, 500)}`);
        }

        if (!parsed.ok) {
            throw new Error(parsed.error ?? 'reminders-helper failed without a message');
        }
        return parsed.data ?? {};
    }

    async snapshot(): Promise<HelperSnapshot> {
        return JSON.parse(lastLine(await this.runExec({ action: 'snapshot' })));
    }

    private runExec(command: Record<string, unknown>): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(this.binaryPath, ['exec'], { stdio: ['pipe', 'pipe', 'pipe'] });

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', chunk => { stdout += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });

            const timer = setTimeout(() => {
                child.kill('SIGKILL');
                reject(new Error(`reminders-helper exec timed out after ${EXEC_TIMEOUT_MILLIS}ms`));
            }, EXEC_TIMEOUT_MILLIS);

            child.on('error', e => { clearTimeout(timer); reject(e); });
            child.on('close', code => {
                clearTimeout(timer);
                // A failing exec still prints a JSON error object, which carries a
                // better message than the exit code, so prefer stdout when present.
                if (code !== 0 && !stdout.trim()) {
                    reject(new Error(`reminders-helper exited ${code}: ${stderr.slice(0, 500)}`));
                    return;
                }
                resolve(stdout);
            });

            child.stdin.end(JSON.stringify(command));
        });
    }
}

function lastLine(output: string): string {
    const lines = output.trim().split('\n');
    return lines[lines.length - 1] ?? '';
}
