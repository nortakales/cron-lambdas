import * as HTTPS from 'https';
import * as SM from './secrets';
import { get } from 'http';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const API_KEY_SECRET_ZYTE = process.env.API_KEY_SECRET_ZYTE;
let zyteApiKey: string | undefined;

// Generic short-lived response cache, see HttpRequestOptions.useCache below. Backed by an S3 bucket
// shared across lambdas (see src/lib/constructs/http-cache-bucket.ts). This lets a lambda that fails
// partway through a run and gets retried from the start skip re-fetching URLs it already succeeded on.
// S3 (rather than DynamoDB) because full rendered pages (e.g. lego.com product pages, which run
// 700-900KB raw) can exceed DynamoDB's hard 400KB item limit even gzip-compressed; S3 has no such
// practical size ceiling.
const s3Client = new S3Client({ region: process.env.REGION });
const HTTP_CACHE_BUCKET_NAME = process.env.HTTP_CACHE_BUCKET_NAME;
const HTTP_CACHE_TTL_MINUTES = process.env.HTTP_CACHE_TTL_MINUTES ? Number(process.env.HTTP_CACHE_TTL_MINUTES) : 30;

export interface Status {
    readonly statusCode: number
    readonly statusMessage: string,
    readonly location?: string,
    readonly payload?: string
}

export function isStatusObject(thing: unknown) {
    return thing && typeof thing === 'object' && thing.hasOwnProperty('statusCode') && thing.hasOwnProperty('statusMessage');
}

export interface HttpRequestOptions {
    userAgent?: string
    attempts?: number,
    useProxy?: boolean,
    useProxyOnFinalAttempt?: boolean,
    headers?: any,
    downgrade404Logging?: boolean
    method?: string,
    body?: string,
    // If true, checks the shared HTTP response cache for this exact URL before making the request, and
    // stores the result on success for HTTP_CACHE_TTL_MINUTES (default 30). Only supported for GET
    // requests, since the cache key is the URL alone. Only successful responses are cached; failures
    // (thrown Status errors) are always retried fresh. Requires the lambda to have HTTP_CACHE_BUCKET_NAME
    // set and read/write access to that bucket (see src/lib/constructs/http-cache-bucket.ts).
    useCache?: boolean
}

const RETRYABLE_CODES = [
    500,
    502,
    503,
    504,
    429
];

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
    // 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    // 'Accept-Encoding': 'gzip, deflate, br',
    // 'Accept-Language': 'en-US,en;q=0.9',
    // 'Referer': 'https://google.com/',
    // 'Upgrade-Insecure-Requests': '1'
};

const DEFAULT_HTTP_CONNECTION_TIMEOUT = 10000;

export async function httpsGet(url: string, options?: HttpRequestOptions): Promise<string> {

    const useCache = shouldUseCache(url, options);

    if (useCache) {
        const cached = await getCachedResponse(url);
        if (cached !== undefined) {
            console.log("Using cached response for URL: " + url);
            return cached;
        }
    }

    // try {
    const response = await innerHttpsGet(url, options);
    if (typeof response === 'string') {
        if (useCache) {
            await setCachedResponse(url, response as string);
        }
        return response as string;
    } else {
        const status = response as Status;
        // if (status.payload && status.payload.length < 1000) {
        //     console.log("Payload is small enough, dumping payload:")
        //     console.log(status.payload);
        // }
        if (status.statusCode != 404 || !options?.downgrade404Logging) {
            console.error(JSON.stringify(status, null, 2));
        } else {
            console.info(JSON.stringify(status, null, 2));
        }
        throw status;
    }
    // } catch (error) {
    //     console.log("yet another catch");
    //     throw error;
    // }
}

function shouldUseCache(url: string, options?: HttpRequestOptions): boolean {
    if (!options?.useCache) {
        return false;
    }
    if (!HTTP_CACHE_BUCKET_NAME) {
        console.warn(`useCache was requested for URL ${url} but HTTP_CACHE_BUCKET_NAME is not configured, skipping cache`);
        return false;
    }
    const method = options?.method || 'GET';
    if (method !== 'GET') {
        // The cache key is derived from the URL alone, which isn't safe to reuse across different
        // request bodies.
        console.warn(`useCache was requested for a ${method} request to URL ${url}, but caching only supports GET requests, skipping cache`);
        return false;
    }
    return true;
}

// S3 object keys can technically hold a raw URL, but hashing keeps keys a fixed, safe shape regardless
// of URL length/characters and avoids leaking full URLs (some of which carry API keys/credentials as
// query params, e.g. the Brickset calls) into S3 key names/logs.
function cacheKeyForUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

async function getCachedResponse(url: string): Promise<string | undefined> {
    try {
        const object = await s3Client.send(new GetObjectCommand({
            Bucket: HTTP_CACHE_BUCKET_NAME!,
            Key: cacheKeyForUrl(url)
        }));
        const expiresAt = Number(object.Metadata?.expiresat);
        if (Number.isFinite(expiresAt) && expiresAt < Math.floor(Date.now() / 1000)) {
            // The lifecycle rule on the bucket is only a storage-cost backstop (S3 can't express a
            // 30-minute expiration), so also enforce expiry here to avoid ever serving stale data.
            console.log(`Cache entry for URL ${url} has expired, ignoring`);
            return undefined;
        }
        if (!object.Body) {
            return undefined;
        }
        // Stored gzip-compressed, see setCachedResponse.
        const compressed = await object.Body.transformToByteArray();
        return zlib.gunzipSync(Buffer.from(compressed)).toString('utf8');
    } catch (error: any) {
        if (error?.name === 'NoSuchKey') {
            return undefined;
        }
        console.warn(`Failed to read HTTP cache for URL ${url}, proceeding without cache: ${(error as Error).message}`);
        return undefined;
    }
}

async function setCachedResponse(url: string, response: string): Promise<void> {
    try {
        const compressed = zlib.gzipSync(response);
        const expiresAt = Math.floor(Date.now() / 1000) + (HTTP_CACHE_TTL_MINUTES * 60);
        await s3Client.send(new PutObjectCommand({
            Bucket: HTTP_CACHE_BUCKET_NAME!,
            Key: cacheKeyForUrl(url),
            Body: compressed,
            Metadata: { expiresat: String(expiresAt) }
        }));
    } catch (error) {
        console.warn(`Failed to write HTTP cache for URL ${url}: ${(error as Error).message}`);
    }
}

async function zyteGet(url: string, attempts: number = 3, delay: number = 0): Promise<string> {
    console.log("Using Zyte for URL: " + url);
    if (!zyteApiKey) {
        zyteApiKey = await SM.getSecretString(API_KEY_SECRET_ZYTE!) as string;
    }
    const auth = Buffer.from(`${zyteApiKey}:`).toString('base64');

    const requestBody = JSON.stringify({ url, httpResponseBody: true, followRedirect: true });

    if (delay > 0) {
        console.log("Sleeping for " + delay + "ms before Zyte retry");
        await new Promise(r => setTimeout(r, delay));
    }

    try {
        return await new Promise((resolve, reject) => {
            const reqOptions: HTTPS.RequestOptions = {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                },
                timeout: 20000
            };

            const request = HTTPS.request('https://api.zyte.com/v1/extract', reqOptions, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        console.warn(`Zyte API returned ${response.statusCode} for ${url}: ${data}`);
                        return reject({
                            statusCode: response.statusCode,
                            statusMessage: `Zyte API error for ${url}`,
                            payload: data.length < 100000 ? data : 'Payload too large'
                        });
                    }
                    try {
                        const json = JSON.parse(data);
                        resolve(Buffer.from(json.httpResponseBody, 'base64').toString('utf8'));
                    } catch (e) {
                        reject(new Error('Failed to parse Zyte response: ' + data));
                    }
                });
            });

            request.on('error', (error) => {
                console.warn(`Zyte request error for ${url}: ${error.message}`);
                reject(error);
            });
            request.on('timeout', () => {
                console.warn(`Zyte request timed out for ${url}`);
                request.destroy();
                reject(new Error(`Zyte request timed out for ${url}`));
            });
            request.write(requestBody);
            request.end();
        });
    } catch (error) {
        if (attempts > 1) {
            console.log(`Zyte request failed for ${url}, retrying (${attempts - 1} attempts left)`);
            return zyteGet(url, attempts - 1, delay + 1500);
        }
        console.error(`Zyte request failed for ${url} after all retries`);
        throw error;
    }
}

async function innerHttpsGet(originalUrl: string, options?: HttpRequestOptions, delay: number = 0): Promise<string | Status> {

    const userAgent = options?.userAgent || DEFAULT_USER_AGENT;
    const attempts = options?.attempts || 3;
    const headers = options?.headers || DEFAULT_HEADERS;
    const useProxy = options?.useProxy || false;
    const useProxyOnFinalAttempt = options?.useProxyOnFinalAttempt || false;
    const method = options?.method || 'GET';
    const body = options?.body;

    if (delay > 0) {
        console.log("Sleeping for " + delay + "ms");
        await new Promise(r => setTimeout(r, delay));
    }

    const url = originalUrl;

    if (attempts < 3) {
        console.log(`${method}-ing (with ${attempts} attempts left): ${url}`);
    } else {
        console.log(`${method}-ing: ${url}`);
    }

    if (useProxy || (attempts === 1 && useProxyOnFinalAttempt)) {
        return zyteGet(originalUrl, attempts);
    }

    return new Promise(function (resolve, reject) {

        const options: HTTPS.RequestOptions = {
            method,
            headers: {
                'User-Agent': userAgent,
                ...DEFAULT_HEADERS,
                ...headers
            },
            timeout: DEFAULT_HTTP_CONNECTION_TIMEOUT
        };

        // If method is POST, ensure a body is present
        if (method === 'POST' && (!body || body.length === 0)) {
            throw new Error('POST requests require a non-empty body');
        }

        // If a body is present, require a Content-Type header
        if (body && !headers['Content-Type'] && !headers['content-type']) {
            throw new Error('Requests with a body must include a Content-Type header');
        }

        // If a body is provided and Content-Length is not set, set it.
        if (body && !headers['Content-Length'] && !headers['content-length']) {
            try {
                const length = Buffer.byteLength(body as string, 'utf8');
                (options.headers as any)['Content-Length'] = length;
            } catch (e) {
                // ignore
            }
        }

        try {
            var request = HTTPS.request(url, options, (response) => {

                if (response?.statusCode === undefined) {
                    return resolve({
                        statusCode: -1,
                        statusMessage: "Response had no status code"
                    });
                }

                if (RETRYABLE_CODES.includes(response.statusCode) && attempts > 1) {
                    console.log(`Received StatusCode: ${response.statusCode} ${statusCodes[response.statusCode]}, will retry`);
                    if (response.statusCode === 429) {
                        // Add extra delay for too many requests
                        delay += 5000;
                    }
                    return resolve(innerHttpsGet(originalUrl, {
                        userAgent,
                        attempts: attempts - 1,
                        headers,
                        useProxy,
                        useProxyOnFinalAttempt,
                        method,
                        body
                    }, delay + 1500));
                }

                // if (response.statusCode < 200 || response.statusCode >= 300) {
                //     const errorMessage = 'Non-success status code getting URL: ' + url +
                //         ' StatusCode: ' + response.statusCode + " " + statusCodes[response.statusCode];
                //     console.log(errorMessage);
                //     return resolve({
                //         statusCode: response.statusCode,
                //         statusMessage: errorMessage
                //     });
                // }

                let data = '';

                response.on('data', (chunk) => {
                    //console.log("Retrieving data");
                    data += chunk;
                });

                response.on('end', () => {
                    //console.log("Ended data transfer");

                    if (response.statusCode !== undefined && (response.statusCode === 301 || response.statusCode === 302)) {

                        let newLocation = response.headers.location;

                        const logMessage = `HTTP ${response.statusCode}: ${originalUrl} moved to ${newLocation}`;
                        console.info(logMessage);
                        if (newLocation !== undefined) {


                            // Sometimes the new location does not include the domain name, just the path
                            const parts = getPartsOfUrl(originalUrl);
                            if (!newLocation.includes(parts.domain!)) {
                                newLocation = parts.protocol! + parts.domain! + (newLocation.startsWith('/') ? '' : '/') + newLocation;
                            }

                            resolve(innerHttpsGet(newLocation, {
                                userAgent,
                                attempts,
                                headers,
                                useProxy,
                                useProxyOnFinalAttempt,
                                method,
                                body
                            }, delay + 1000));

                        } else {
                            resolve({
                                statusCode: response.statusCode,
                                statusMessage: logMessage,
                                payload: data.length < 100000 ? data : 'Payload too large (greater than 100,000 characters)'
                            });

                        }
                    } else if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode >= 300)) {
                        const errorMessage = 'Non-success status code getting URL: ' + url +
                            ' StatusCode: ' + response.statusCode + " " + statusCodes[response.statusCode];
                        console.log(errorMessage);
                        resolve({
                            statusCode: response.statusCode,
                            statusMessage: errorMessage,
                            payload: data.length < 100000 ? data : 'Payload too large (greater than 100,000 characters)'
                        });
                    } else {
                        resolve(data);
                    }
                    //resolve(data);
                });

            });

            request.on("error", (error) => {
                console.log("WARNING Unknown issue getting URL " + url + ", message is: " + error.message + ", destroying request, will retry if attempts remain");
                request.destroy();
                if (attempts > 1) {
                    return resolve(innerHttpsGet(originalUrl, {
                        userAgent,
                        attempts: attempts - 1,
                        headers,
                        useProxy,
                        useProxyOnFinalAttempt,
                        method,
                        body
                    }, delay + 1500));
                } else {
                    return reject(error);
                }
            });

            request.on('timeout', () => {
                console.log("WARNING Request for URL " + url + " timed out, destroying request, will retry if attempts remain");
                request.destroy();
                if (attempts > 1) {
                    return resolve(innerHttpsGet(originalUrl, {
                        userAgent,
                        attempts: attempts - 1,
                        headers,
                        useProxy,
                        useProxyOnFinalAttempt,
                        method,
                        body
                    }, delay + 1500));
                } else {
                    reject();
                }
            });

            // If there's a body, write it to the request before ending.
            if (body) {
                request.write(body);
            }

            request.end();

        } catch (error) {
            console.log("ERROR Never seen this catch get hit, is it possible?");
            throw error;
        }
    });
}

const statusCodes: { [key: number]: string } = {
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Moved Temporarily",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Request Entity Too Large",
    414: "Request-URI Too Long",
    415: "Unsupported Media Type",
    416: "Requested Range Not Satisfiable",
    417: "Expectation Failed",
    418: "I'm a teapot",
    419: "Insufficient Space on Resource",
    420: "Method Failure",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    451: "Unavailable For Legal Reasons",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    507: "Insufficient Storage",
    511: "Network Authentication Required"
}

function getPartsOfUrl(url: string) {
    let tempUrl = url;
    const protocol = /^https:\/\//g.exec(tempUrl)?.[0];
    if (protocol) {
        tempUrl = tempUrl.replace(protocol, '');
    }
    const domain = /^[^/?]+/.exec(tempUrl)?.[0];
    if (domain) {
        tempUrl = tempUrl.replace(domain, '');
    }
    const path = /^[^?]+/.exec(tempUrl)?.[0];
    if (path) {
        tempUrl = tempUrl.replace(path, '');
    }
    const queryString = /^\?.*/.exec(tempUrl)?.[0];
    return {
        protocol,
        domain,
        path,
        queryString
    }
}



// async function test() {
//     const html = await httpsGet('https://www.lego.com/en-us/product/lotr-10316');
//     console.log(html);
// }

// test();