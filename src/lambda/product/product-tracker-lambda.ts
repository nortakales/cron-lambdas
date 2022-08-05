import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";

const ENABLED = process.env.ENABLED!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    if (ENABLED !== 'true') {
        console.log("Product Tracker is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }

    // TODO
    // iterate through all products
    // call the appropriate tracker for that product
    //      tracker should query page and get details
    //      tracker should just return latest product
    // store historical record
    // make updates to current product
    // accumulate notifications into email based on diff
    // send email

    const emailBody = "TODO"

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