import * as AWS from 'aws-sdk';
import * as HTTPS from 'https';

import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

interface UrlMatch {
    fullMatch: string,
    url: string,
    name: string,
}

const EMAIL_LIST = process.env.emailList!;
const SUBJECT = process.env.subject!;
const FROM = process.env.from!;
const TABLE_NAME = process.env.tableName!;
const REGION = process.env.region!;

const DDB = DynamoDBDocument.from(new DynamoDB({ region: REGION }));

const awsOptions: AWS.ConfigurationOptions = {
    region: REGION
};
AWS.config.update(awsOptions);
const SES = new AWS.SES(awsOptions);

async function getUrlFromDDB(url: string) {

    const item = await DDB.get({
        TableName: TABLE_NAME,
        Key: {
            url: url
        }
    });

    if (item.Item !== undefined) {
        console.log("Found in DDB: " + item.Item.url + " " + item.Item.name);
    }

    return item.Item;
}

async function writeUrlToDDB(url: string, name: string) {

    console.log("Writing to DDB: " + url + " " + name);

    await DDB.put({
        TableName: TABLE_NAME,
        Item: {
            url: url,
            name: name
        }
    });
}

async function parseSchedulePageForNewUrls(html: string): Promise<UrlMatch[]> {

    console.log("Parsing HTML");

    html = html.replace(/\s+/g, " ");
    const allUrls = html.matchAll(/<a href="(.*?)">(.*?)<\/a>/gi);

    let processedUrls: { [key: string]: boolean } = {};
    let newUrls: UrlMatch[] = [];

    // For every URL on the page
    for (const urlMatch of allUrls) {
        const url = {
            fullMatch: urlMatch[0],
            url: urlMatch[1],
            name: urlMatch[2]
        }

        if (processedUrls[url.url])
            continue;

        processedUrls[url.url] = true;

        // Only look at those containing some variation of "autocross"
        if (url.fullMatch.match(/auto\s*(x|cross)/i)) {

            console.log("Processing " + url.fullMatch);

            const urlFromDb = await getUrlFromDDB(url.url);

            if (urlFromDb !== undefined) {
                continue;
            }

            console.log("New!");

            await writeUrlToDDB(url.url, url.name);

            newUrls.push(url);
        }
    }

    return newUrls;
}

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

async function sendEmail(urls: UrlMatch[]) {

    if (urls == undefined || urls.length < 1) {
        console.log("No email to send");
        return;
    }

    console.log("Sending email");

    let emailBody = "New AutoX discovered:\n\n";

    for (let url of urls) {
        emailBody += url.name + "\n" + url.url + "\n\n";
    }

    console.log("Start email body -----------");
    console.log(emailBody);
    console.log("End email body -----------");

    var params: AWS.SES.SendEmailRequest = {
        Destination: {
            ToAddresses: EMAIL_LIST.split(","),
        },
        Message: {
            Body: {
                Text: { Data: emailBody },
            },

            Subject: { Data: SUBJECT },
        },
        Source: FROM,
    };

    return SES.sendEmail(params).promise();
}

exports.handler = async (event = {}) => {

    console.log("Running...");

    const html = await httpsGet("https://evergreenspeedway.com/schedule/");
    const newUrls = await parseSchedulePageForNewUrls(html);

    if (newUrls.length < 1) {
        console.log("No new URLs found, exiting...");
        return;
    }

    await sendEmail(newUrls);
};

// Uncomment this to call locally through ts-node
exports.handler();