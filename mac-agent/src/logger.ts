/**
 * Line-oriented logging for the agent. launchd captures stdout/stderr to the log
 * files named in the LaunchAgent plist, so structure matters more than colour.
 */

type Level = 'INFO' | 'WARN' | 'ERROR';

function emit(level: Level, scope: string, message: string, detail?: unknown) {
    const line = `${new Date().toISOString()} ${level} [${scope}] ${message}`;
    const stream = level === 'ERROR' ? console.error : console.log;
    if (detail === undefined) {
        stream(line);
    } else {
        stream(line, detail instanceof Error ? (detail.stack ?? detail.message) : detail);
    }
}

export function logger(scope: string) {
    return {
        info: (message: string, detail?: unknown) => emit('INFO', scope, message, detail),
        warn: (message: string, detail?: unknown) => emit('WARN', scope, message, detail),
        error: (message: string, detail?: unknown) => emit('ERROR', scope, message, detail),
    };
}

export type Logger = ReturnType<typeof logger>;
