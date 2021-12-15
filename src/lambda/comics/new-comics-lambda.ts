import { sendEmail } from "../emailer";
import { getFilteredAndSortedComics } from "./new-comics-sort-and-filter";

const ENABLED = process.env.ENABLED!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;

exports.handler = async (event: any = {}, context: any = {}) => {

    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    if (ENABLED !== 'true') {
        console.log("New Comics is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }
    const comics = await getFilteredAndSortedComics();
    const emailBody = generateEmailBody(comics);

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

function generateEmailBody(comics: Comic[]) {

    let body = "<html><body>";

    let publisher = null;
    for (let comic of comics) {
        if (comic.publisher !== publisher) {
            publisher = comic.publisher;
            body += `<h1>${publisher}</h1>`
        }
        body += `
        <div style="display: flex">
            <a href="${comic.comicUrl}">
                <img src="${comic.imageUrl}" style="height: 260px; width: 170px">
            </a>
            <span style="padding: 10px; font-size: 1.2rem;">${comic.title}</span>
        </div>
        `
    }

    body += "</body></html>";

    return body;
}

// Uncomment this to call locally
// exports.handler();