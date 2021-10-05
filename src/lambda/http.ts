import * as HTTPS from 'https';

export async function httpsGet(url: string): Promise<string> {

    console.log("Getting " + url);

    return new Promise(function (resolve, reject) {

        const options = {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };

        var request = HTTPS.get(url, options, (response) => {

            if (response?.statusCode === undefined ||
                response.statusCode < 200 ||
                response.statusCode >= 300) {
                return reject(new Error('statusCode=' + response.statusCode));
            }

            let data = '';

            response.on('data', (chunk) => {
                console.log("Retrieving data");
                data += chunk;
            });

            response.on('end', () => {
                console.log("Ended data transfer");
                resolve(data);
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
            reject(err.message);
        });

        request.end();
    });
}