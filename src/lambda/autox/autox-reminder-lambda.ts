import { httpsGet } from '../http';
import { sendEmail } from '../emailer';
import * as DDB from '../dynamo';

const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const TABLE_NAME = process.env.TABLE_NAME!;
const ENABLED = process.env.ENABLED!;

interface UrlMatch {
    fullMatch: string,
    url: string,
    name: string,
}

async function getUrlFromDDB(url: string) {
    return await DDB.get(TABLE_NAME, {
        url: url
    });
}

async function writeUrlToDDB(url: string, name: string) {
    await DDB.put(TABLE_NAME, {
        url: url,
        name: name
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

function createEmailBody(urls: UrlMatch[]): string {

    let emailBody = "New AutoX discovered:\n\n";

    for (let url of urls) {
        emailBody += url.name + "\n" + url.url + "\n\n";
    }

    console.log("Start email body -----------");
    console.log(emailBody);
    console.log("End email body -----------");

    return emailBody;
}

exports.handler = async (event = {}) => {
    if (ENABLED !== 'true') {
        console.log("Autox Reminder is not enabled, exiting...");
        return;
    }

    console.log("Running...");

    const html = await httpsGet("https://evergreenspeedway.com/schedule/");
    const newUrls = await parseSchedulePageForNewUrls(html);

    if (newUrls.length < 1) {
        console.log("No new URLs found, exiting...");
        return;
    }

    const emailBody = createEmailBody(newUrls);

    await sendEmail({
        toAddresses: EMAIL_LIST.split(','),
        fromAddress: FROM,
        subject: SUBJECT,
        body: emailBody
    });
};

// Uncomment this to call locally
// exports.handler();