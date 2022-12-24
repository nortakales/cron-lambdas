import * as HTTPS from 'https';

const RETRYABLE_CODES = [
    500,
    502,
    503,
    504
]

export async function httpsGet(url: string, userAgent?: string, attempts: number = 3, headers: any = {}): Promise<string> {

    console.log(`Getting this URL with ${attempts} attempts left: ${url}`);

    return new Promise(function (resolve, reject) {

        const userAgentHeader = { 'User-Agent': userAgent || 'Mozilla/5.0' };

        const options = {
            headers: {
                ...userAgentHeader,
                ...headers
            }
        };

        var request = HTTPS.get(url, options, (response) => {

            if (response?.statusCode === undefined) {
                return reject(new Error('https get had no status code!'));
            }

            if (RETRYABLE_CODES.includes(response.statusCode) && attempts > 1) {
                console.log(`Received statusCode=${response.statusCode}, will retry`);
                return httpsGet(url, userAgent, --attempts);
            }

            let statusCodeMessage = '';
            switch (response.statusCode) {
                case 429:
                    statusCodeMessage = ' Too many requests!';
                    break;
            }

            if (response.statusCode < 200 ||
                response.statusCode >= 300) {
                const errorMessage = 'Error getting URL: ' + url +
                    '\nStatusCode: ' + response.statusCode +
                    '\nStatusCodeMessage: ' + statusCodeMessage;
                console.log(errorMessage);
                // TODO maybe move this to when data transfer is finished to dump the response data?
                throw new Error(errorMessage);
            }

            let data = '';

            response.on('data', (chunk) => {
                //console.log("Retrieving data");
                data += chunk;
            });

            response.on('end', () => {
                //console.log("Ended data transfer");
                resolve(data);
            });

        }).on("error", (error) => {
            const errorMessage = 'Error getting URL: ' + url +
                '\nErrorMessage: ' + error.message
            console.log(errorMessage);
            throw error;
        });

        request.end();
    });
}