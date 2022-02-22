import { httpsGet } from '../http';
import { sendEmail } from '../emailer';
import * as DDB from '../dynamo';
import moment from 'moment';
import { createTimer } from '../events';
import { NotificationApplication, sendPushNotification, Sound, UrlOptions } from '../notifier';

const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const TABLE_NAME = process.env.TABLE_NAME!;
const ENABLED = process.env.ENABLED!;
const PUSH_NOTIFICATION_LAMBDA_ARN = process.env.PUSH_NOTIFICATION_LAMBDA_ARN!;

interface UrlMatch {
    fullMatch: string
    url: string
    name: string
    firstTimerId: string | null
    secondTimerId: string | null
    registrationDate: Date | null
    registrationAlreadyOpen: boolean
}

async function getUrlFromDDB(url: string) {
    return await DDB.get(TABLE_NAME, {
        url: url
    });
}

async function writeUrlToDDB(urlMatch: UrlMatch) {
    if (urlMatch.firstTimerId && urlMatch.secondTimerId && urlMatch.registrationDate) {
        await DDB.put(TABLE_NAME, {
            url: urlMatch.url,
            name: urlMatch.name,
            firstTimerId: urlMatch.firstTimerId,
            secondTimerId: urlMatch.secondTimerId,
            registrationDate: urlMatch.registrationDate.getTime(),
            registrationAlreadyOpen: urlMatch.registrationAlreadyOpen
        });
    } else {
        await DDB.put(TABLE_NAME, {
            url: urlMatch.url,
            name: urlMatch.name,
            registrationAlreadyOpen: urlMatch.registrationAlreadyOpen
        });
    }
}

async function parseSchedulePageForNewUrls(html: string): Promise<UrlMatch[]> {

    console.log("Parsing HTML");

    html = html.replace(/\s+/g, " ");
    const allUrls = html.matchAll(/<a href="(.*?)">(.*?)<\/a>/gi);

    let processedUrls: { [key: string]: boolean } = {};
    let newUrls: UrlMatch[] = [];

    // For every URL on the page
    for (const url of allUrls) {
        const urlMatch: UrlMatch = {
            fullMatch: url[0],
            url: url[1],
            name: url[2],
            firstTimerId: null,
            secondTimerId: null,
            registrationDate: null,
            registrationAlreadyOpen: false
        }

        if (processedUrls[urlMatch.url])
            continue;

        processedUrls[urlMatch.url] = true;

        // Only look at those containing some variation of "autocross"
        if (urlMatch.fullMatch.match(/auto\s*(x|cross)/i)) {

            console.log("Processing " + urlMatch.fullMatch);

            const urlFromDb = await getUrlFromDDB(urlMatch.url);

            if (urlFromDb !== undefined) {
                continue;
            }

            console.log("New Autox URL!");

            const autoxPageHtml = await httpsGet(urlMatch.url);
            urlMatch.registrationDate = getRegistrationTimeFromHtml(autoxPageHtml);
            urlMatch.registrationAlreadyOpen = isRegistrationAlreadyOpen(autoxPageHtml);

            if (urlMatch.registrationDate !== null) {
                const firstNotificationDate = getFirstNotificationDate(urlMatch.registrationDate);
                const firstTimerId = await createTimer(firstNotificationDate, PUSH_NOTIFICATION_LAMBDA_ARN, urlMatch)
                urlMatch.firstTimerId = firstTimerId;

                const secondNotificationDate = getSecondNotificationDate(urlMatch.registrationDate);
                const secondTimerId = await createTimer(secondNotificationDate, PUSH_NOTIFICATION_LAMBDA_ARN, urlMatch)
                urlMatch.secondTimerId = secondTimerId;
            }

            await writeUrlToDDB(urlMatch);

            newUrls.push(urlMatch);
        }
    }

    return newUrls;
}

function createEmailBody(urls: UrlMatch[]): string {

    let emailBody = "New AutoX!\n\n";

    for (let url of urls) {

        let registrationDate = "Oops, couldn't parse registration date... you won't get a push notification";
        if (url.registrationDate) {
            registrationDate = url.registrationDate?.toLocaleString('en-us', { timeZone: 'America/Los_Angeles' });
        }
        if (url.registrationAlreadyOpen) {
            registrationDate = "Registration is already open!";
        }

        emailBody += url.name + "\n"
            + url.url + "\n"
            + "Registration: " + registrationDate + "\n\n";
    }

    emailBody += "\nIf you want push notifications to your phone 30 min and 5 min before registration actually opens:\n"
        + "1. Download this app: https://pushover.net/\n"
        + "2. Log in to the app and send me your \"user key\"\n"
        + "3. You'll have a free 30 day trial, you have to pay a one time $5 fee (not to me, to the app) if you want notifications forever\n"

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

    for (let urlMatch of newUrls) {
        if (urlMatch.registrationAlreadyOpen) {

            const body = 'New AutoX, and reg is open!\n' +
                urlMatch.name + '\n' +
                urlMatch.url;

            const urlOptions: UrlOptions = {
                url: urlMatch.url,
                urlTitle: urlMatch.name
            }

            await sendPushNotification(NotificationApplication.AUTOX, "AutoX Alert", body, Sound.BUGLE, urlOptions);
        }
    }

    const emailBody = createEmailBody(newUrls);

    await sendEmail({
        toAddresses: EMAIL_LIST.split(','),
        fromAddress: FROM,
        subject: SUBJECT,
        textBody: emailBody
    });
};

const registrationRegex = /[Rr]egistration.{0,20}open.{0,20}(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})(?: at)? (\d{1,2}:\d{2}) ([AaPp][Mm])/;
function getRegistrationTimeFromHtml(html: string) {

    const match = registrationRegex.exec(html);

    if (match) {
        console.log(JSON.stringify(match, null, 2));
        const dateTimeString = match[1] + ' ' + match[2] + match[3].toUpperCase() + ' PST';
        const dateTime = moment(dateTimeString, 'MM/DD/YYYY hh:mma ZZ');
        console.log("Found registration date: " + dateTime.format());
        return dateTime.toDate();
    } else {
        console.log("Could not find registration date/time");
        return null;
    }
}

function isRegistrationAlreadyOpen(html: string) {

    if (html.match(/<form[^>]*?post[^>]*?action[^>]*?\/events\/[^>]*?>/)) {
        return true;
    }
    return false;
}

function getFirstNotificationDate(registrationDate: Date) {
    const thirtyMinutesInMillis = 60 * 30 * 1000;
    return new Date(registrationDate.getTime() - thirtyMinutesInMillis);
}

function getSecondNotificationDate(registrationDate: Date) {
    const fiveMinutesInMillis = 60 * 5 * 1000;
    return new Date(registrationDate.getTime() - fiveMinutesInMillis);
}

// Uncomment this to call locally
// exports.handler();