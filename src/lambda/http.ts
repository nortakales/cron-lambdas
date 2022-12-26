import * as HTTPS from 'https';

export interface Status {
    readonly statusCode: number
    readonly statusMessage: string,
    readonly payload?: string
}

export function isStatusObject(thing: unknown) {
    return thing && typeof thing === 'object' && thing.hasOwnProperty('statusCode') && thing.hasOwnProperty('statusMessage');
}

const RETRYABLE_CODES = [
    500,
    502,
    503,
    504
]

export async function httpsGet(url: string, userAgent?: string, attempts: number = 3, headers: any = {}): Promise<string> {
    // try {
    const response = await innerHttpsGet(url, userAgent, attempts, headers);
    if (typeof response === 'string') {
        return response as string;
    } else {
        const status = response as Status;
        // if (status.payload && status.payload.length < 1000) {
        //     console.log("Payload is small enough, dumping payload:")
        //     console.log(status.payload);
        // }
        throw status;
    }
    // } catch (error) {
    //     console.log("yet another catch");
    //     throw error;
    // }
}

async function innerHttpsGet(url: string, userAgent?: string, attempts: number = 3, headers: any = {}): Promise<string | Status> {

    if (attempts < 3) {
        console.log(`Getting this URL with ${attempts} attempts left: ${url}`);
    } else {
        console.log(`Getting this URL: ${url}`);
    }

    return new Promise(function (resolve, reject) {

        const userAgentHeader = { 'User-Agent': userAgent || 'Mozilla/5.0' };

        const options = {
            headers: {
                ...userAgentHeader,
                ...headers
            }
        };

        try {
            var request = HTTPS.get(url, options, (response) => {

                if (response?.statusCode === undefined) {
                    return resolve({
                        statusCode: -1,
                        statusMessage: "Response had no status code"
                    });
                }

                if (RETRYABLE_CODES.includes(response.statusCode) && attempts > 1) {
                    console.log(`Received StatusCode: ${response.statusCode} ${statusCodes[response.statusCode]}, will retry`);
                    return resolve(innerHttpsGet(url, userAgent, --attempts));
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

                    if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode >= 300)) {
                        const errorMessage = 'Non-success status code getting URL: ' + url +
                            ' StatusCode: ' + response.statusCode + " " + statusCodes[response.statusCode];
                        console.log(errorMessage);
                        resolve({
                            statusCode: response.statusCode,
                            statusMessage: errorMessage,
                            payload: data.length < 2000 ? data : 'Payload too large'
                        });
                    } else {
                        resolve(data);
                    }
                    //resolve(data);
                });

            }).on("error", (error) => {
                const errorMessage = 'ERROR Error getting URL: ' + url +
                    ' ErrorMessage: ' + error.message
                console.log(errorMessage);
                return reject(error);
            }).on("abort", () => {
                const errorMessage = 'ERROR Aborted getting URL: ' + url;
                console.log(errorMessage);
                return reject(new Error(errorMessage));
            });

            request.end();

        } catch (error) {
            console.log("Never seen this catch get hit, is it possible?");
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