import * as AWS from 'aws-sdk';
import * as HTTPS from 'https';

const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const API_KEY = process.env.API_KEY!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;
const REGION = process.env.REGION!;
const ENABLED = process.env.ENABLED!;

const awsOptions: AWS.ConfigurationOptions = {
    region: REGION
};
AWS.config.update(awsOptions);
const SES = new AWS.SES(awsOptions);

async function httpsGet(url: string): Promise<string> {

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

exports.handler = async (event = {}) => {
    if (ENABLED !== 'true') {
        console.log("Weather Alert is not enabled, exiting...");
        return;
    }

    console.log("Running...");

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${API_KEY}&lang=en&units=imperial`;
    console.log(url);

    const data = await httpsGet(url);

    var params: AWS.SES.SendEmailRequest = {
        Destination: {
            ToAddresses: EMAIL_LIST.split(","),
        },
        Message: {
            Body: {
                Text: { Data: data },
            },

            Subject: { Data: SUBJECT },
        },
        Source: FROM,
    };

    await SES.sendEmail(params).promise();

    console.log("Complete");
};

// Uncomment this to call locally
// exports.handler();