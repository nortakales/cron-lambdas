import * as HTTPS from 'https';
import * as SM from './secrets';
import { get } from 'http';

const API_KEY_SECRET_SCRAPERAPI = process.env.API_KEY_SECRET_SCRAPERAPI;

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
    body?: string
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

    // try {
    const response = await innerHttpsGet(url, options);
    if (typeof response === 'string') {
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

    let url = originalUrl;
    if (useProxy || (attempts === 1 && useProxyOnFinalAttempt)) {
        console.log("Using proxy for URL: " + url);
        const key = await SM.getSecretString(API_KEY_SECRET_SCRAPERAPI!);
        url = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(originalUrl)}`;
    }

    if (attempts < 3) {
        console.log(`${method}-ing (with ${attempts} attempts left): ${url}`);
    } else {
        console.log(`${method}-ing: ${url}`);
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