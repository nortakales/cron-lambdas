import { createHash, timingSafeEqual } from 'crypto';
import { getSecretString } from '../secrets';

/**
 * HTTP API Lambda authorizer (payload format 2.0, simple response) guarding every
 * consumer route. Validates `Authorization: Bearer <api-key>` against the keys in
 * Secrets Manager.
 *
 * The secret holds a JSON object of `name -> key`, so keys can be added for a new
 * consumer, or rotated one at a time, by editing the secret alone. A bare string
 * secret is also accepted and treated as the single key named `default`.
 */

const API_KEY_SECRET = process.env.API_KEY_SECRET!;
/** Secret values are cached in the execution environment so a warm invoke costs no API call. */
const SECRET_CACHE_MILLIS = 5 * 60 * 1000;

interface CachedKeys {
    /** sha256 digest of each valid key, by key name. */
    digests: Map<string, Buffer>;
    fetchedAt: number;
}

let cache: CachedKeys | undefined;

export const handler = async (event: any = {}) => {
    try {
        const presented = extractBearerToken(event);
        if (!presented) {
            console.warn('Rejecting request with no usable Authorization header');
            return { isAuthorized: false };
        }

        const keyName = await matchKeyName(presented);
        if (!keyName) {
            console.warn('Rejecting request with an unrecognized API key');
            return { isAuthorized: false };
        }

        return { isAuthorized: true, context: { keyName } };
    } catch (e) {
        // Never fail open: an unreachable Secrets Manager denies rather than admits.
        console.error('Authorizer failed to evaluate the request', e);
        return { isAuthorized: false };
    }
};

function extractBearerToken(event: any): string | undefined {
    // API Gateway lowercases header names in payload format 2.0.
    const header: string | undefined = event?.headers?.authorization ?? event?.headers?.Authorization;
    if (typeof header !== 'string') return undefined;

    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return match ? match[1] : undefined;
}

async function matchKeyName(presented: string): Promise<string | undefined> {
    const { digests } = await loadKeys();
    const presentedDigest = sha256(presented);

    for (const [name, digest] of digests) {
        // Comparing fixed-length digests keeps the check constant-time and avoids
        // leaking key length through timingSafeEqual's length requirement.
        if (timingSafeEqual(presentedDigest, digest)) {
            return name;
        }
    }
    return undefined;
}

async function loadKeys(): Promise<CachedKeys> {
    if (cache && Date.now() - cache.fetchedAt < SECRET_CACHE_MILLIS) {
        return cache;
    }

    const raw = await getSecretString(API_KEY_SECRET);
    if (!raw) {
        throw new Error(`Secret ${API_KEY_SECRET} has no string value`);
    }

    const digests = new Map<string, Buffer>();
    for (const [name, key] of Object.entries(parseKeys(raw))) {
        if (typeof key === 'string' && key.length > 0) {
            digests.set(name, sha256(key));
        }
    }
    if (digests.size === 0) {
        throw new Error(`Secret ${API_KEY_SECRET} contains no usable API keys`);
    }

    cache = { digests, fetchedAt: Date.now() };
    return cache;
}

function parseKeys(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // Not JSON: fall through and treat the whole secret as one key.
    }
    return { default: raw };
}

function sha256(value: string) {
    return createHash('sha256').update(value, 'utf-8').digest();
}
