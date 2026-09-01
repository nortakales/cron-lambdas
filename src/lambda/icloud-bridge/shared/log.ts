/**
 * Logging for the bridge Lambdas.
 *
 * The repo-wide `startLambdaLog` dumps the whole event, which for these handlers
 * would write the caller's `Authorization: Bearer <api-key>` header (and message
 * bodies) into CloudWatch. This logs the same useful shape with credentials and
 * content stripped.
 */

const REDACTED = '<redacted>';
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'password'];

export function startBridgeLog(name: string, event: any, context: any) {
    const http = event?.requestContext?.http;
    console.log(`Running ${name} --------------------`);
    if (http) {
        console.log(`REQUEST ${http.method} ${event.rawPath}${event.rawQueryString ? '?' + event.rawQueryString : ''}`);
    }
    console.log('EVENT\n' + JSON.stringify(redact(event), null, 2));
    if (context?.awsRequestId) {
        console.log('REQUEST ID ' + context.awsRequestId);
    }
}

/**
 * Deep-copies `value`, replacing sensitive header values and collapsing request
 * bodies to their length. Cycles are not expected in Lambda events.
 */
export function redact(value: any): any {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(redact);

    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
        const lowered = key.toLowerCase();
        if (SENSITIVE_HEADERS.includes(lowered)) {
            output[key] = REDACTED;
        } else if (lowered === 'body' && typeof item === 'string') {
            output[key] = `<${item.length} bytes>`;
        } else {
            output[key] = redact(item);
        }
    }
    return output;
}
