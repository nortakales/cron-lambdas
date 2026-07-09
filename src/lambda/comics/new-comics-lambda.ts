import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";
import { getFilteredAndSortedComics, extractSeriesName } from "./new-comics-sort-and-filter";
import { scan } from "../dynamo";
import { getSecretString } from "../secrets";

const ENABLED = process.env.ENABLED!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const SERIES_TABLE_NAME = process.env.SERIES_TABLE_NAME!;
const DYNAMO_ACCESS_ENDPOINT = process.env.DYNAMO_ACCESS_ENDPOINT!;
const API_KEY_SECRET_DYNAMO_ACCESS = process.env.API_KEY_SECRET_DYNAMO_ACCESS!;

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    if (ENABLED !== 'true') {
        console.log("New Comics is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }

    const seriesItems = await scan(SERIES_TABLE_NAME) as { seriesName: string }[];
    const excludedSeries = new Set((seriesItems ?? []).map(item => item.seriesName.toLowerCase()));
    console.log(`Loaded ${excludedSeries.size} excluded series from DDB`);

    const apiKey = await getSecretString(API_KEY_SECRET_DYNAMO_ACCESS) as string;

    const comics = await getFilteredAndSortedComics(excludedSeries);
    const emailBody = generateEmailBody(comics, apiKey);

    await sendEmail({
        toAddresses: EMAIL_LIST.split(','),
        fromAddress: FROM,
        subject: SUBJECT,
        htmlBody: emailBody
    });

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
};

function generateEmailBody(comics: Comic[], apiKey: string) {

    let body = "<html><body>";

    let publisher = null;
    for (let comic of comics) {
        if (comic.publisher !== publisher) {
            publisher = comic.publisher;
            body += `<h1>${publisher}</h1>`
        }
        const amazonSearchTitle = comic.title.replace(/\s#\d+(\.\d+)?$/, '');
        const seriesName = extractSeriesName(comic.title);
        const excludeUrl = `${DYNAMO_ACCESS_ENDPOINT}?apiKey=${apiKey}&operation=PUT&table=${SERIES_TABLE_NAME}&a1=seriesName&a2=${encodeURIComponent(seriesName)}`;
        body += `
        <div style="display: flex">
            <a href="${comic.comicUrl}">
                <img src="${comic.imageUrl}" style="height: 260px; width: 170px">
            </a>
            <div style="padding: 10px;">
                <div style="font-size: 1.2rem;">${comic.title}</div>
                <div style="font-size: 1rem;"><a href="https://www.amazon.com/s?k=${encodeURIComponent(amazonSearchTitle)}">Amazon Search</a></div>
                <div style="font-size: 1rem;"><a href="${excludeUrl}">Exclude &ldquo;${seriesName}&rdquo;</a></div>
            </div>
        </div>
        `
    }

    body += "</body></html>";

    return body;
}

// Uncomment this to call locally
// exports.handler();
