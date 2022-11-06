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

            let errorMessage = '';
            switch (response.statusCode) {
                case 429:
                    errorMessage = ' Too many requests!';
                    break;
            }

            if (response.statusCode < 200 ||
                response.statusCode >= 300) {
                return reject(new Error('statusCode=' + response.statusCode + errorMessage));
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

        }).on("error", (err) => {
            console.log("Error: " + err.message);
            reject(err.message);
        });

        request.end();
    });
}