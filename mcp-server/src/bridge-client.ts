/**
 * Thin HTTP client for the iCloud bridge consumer API.
 *
 * The MCP server owns no logic of its own: every tool is a call to the same REST
 * API a dashboard or a Shortcut would use, so agents and humans see identical
 * behaviour and identical permissions.
 */

export interface BridgeClientOptions {
    baseUrl: string;
    apiKey: string;
}

export class BridgeError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
        this.name = 'BridgeError';
    }
}

export class BridgeClient {

    private readonly baseUrl: string;

    constructor(private readonly options: BridgeClientOptions) {
        // Trailing slashes would produce `//messages` after joining.
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    }

    get(path: string, query: Record<string, unknown> = {}) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') {
                params.set(key, String(value));
            }
        }
        const qs = params.toString();
        return this.request('GET', qs ? `${path}?${qs}` : path);
    }

    post(path: string, body: unknown) {
        return this.request('POST', path, body);
    }

    patch(path: string, body: unknown) {
        return this.request('PATCH', path, body);
    }

    private async request(method: string, path: string, body?: unknown): Promise<unknown> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${this.options.apiKey}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const text = await response.text();
        const parsed = text ? safeJson(text) : undefined;

        if (!response.ok) {
            const error = (parsed as { error?: { code?: string; message?: string } })?.error;
            throw new BridgeError(
                response.status,
                error?.code ?? 'HTTP_ERROR',
                error?.message ?? `${method} ${path} failed with ${response.status}`,
            );
        }
        return parsed;
    }
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}
