import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * Response helpers for the bridge's HTTP API Lambdas. Errors follow the
 * `{ error: { code, message } }` envelope in the spec.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
    return {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    };
}

/** Thrown by handlers to produce a specific status code instead of a 500. */
export class ApiError extends Error {
    constructor(readonly statusCode: number, readonly code: string, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export const badRequest = (message: string) => new ApiError(400, 'BAD_REQUEST', message);
export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message);

export function errorResponse(e: unknown): APIGatewayProxyStructuredResultV2 {
    if (e instanceof ApiError) {
        // Client errors are expected traffic, so they are logged at warn level and
        // deliberately avoid the term the error-log notifier subscribes to.
        console.warn(`Rejected request (${e.statusCode} ${e.code}): ${e.message}`);
        return json(e.statusCode, { error: { code: e.code, message: e.message } });
    }
    console.error('Unhandled failure in iCloud bridge handler', e);
    return json(500, { error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw badRequest(`Missing or empty required field: ${field}`);
    }
    return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw badRequest(`Field must be a string: ${field}`);
    return value;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'boolean') throw badRequest(`Field must be a boolean: ${field}`);
    return value;
}

export function optionalNumber(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw badRequest(`Field must be a number: ${field}`);
    }
    return value;
}

/** Parses an ISO8601 timestamp, rejecting anything DynamoDB could not sort. */
export function optionalIsoDate(value: unknown, field: string): string | undefined {
    const raw = optionalString(value, field);
    if (raw === undefined) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw badRequest(`Field must be an ISO8601 date-time: ${field}`);
    }
    return parsed.toISOString();
}

export function parseJsonBody(event: { body?: string; isBase64Encoded?: boolean }): Record<string, any> {
    if (!event.body) throw badRequest('Request body is required');
    const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw badRequest('Request body must be a JSON object');
        }
        return parsed;
    } catch (e) {
        if (e instanceof ApiError) throw e;
        throw badRequest('Request body must be valid JSON');
    }
}

/** Bounds a caller-supplied `limit`, defaulting when absent. */
export function parseLimit(value: string | undefined, fallback: number, max: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw badRequest('limit must be a positive integer');
    }
    return Math.min(parsed, max);
}

/**
 * DynamoDB's LastEvaluatedKey is an object; consumers get it back as one opaque
 * base64url string so they never have to understand our key schema.
 */
export function encodeCursor(key: Record<string, any> | undefined): string | undefined {
    if (!key) return undefined;
    return Buffer.from(JSON.stringify(key), 'utf-8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): Record<string, any> | undefined {
    if (!cursor) return undefined;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw badRequest('Invalid cursor');
        }
        return parsed;
    } catch (e) {
        if (e instanceof ApiError) throw e;
        throw badRequest('Invalid cursor');
    }
}
