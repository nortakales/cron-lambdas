import zlib from 'zlib';
import { sendEmail } from "../emailer";
import { startLambdaLog } from '../utilities/logging';

const REGION = process.env.REGION!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const FROM = process.env.FROM!;

const KNOWN_ANDIGNORED_ISSUES = [
    {
        signature: "Non-success status code getting URL: https://brickranker.com/rankings",
        until: new Date('2024-04-01T00:00:00.000Z')
    }
]

const NOW = new Date().getTime();

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    if (event.awslogs && event.awslogs.data) {
        const zippedPayload = Buffer.from(event.awslogs.data, 'base64');
        const jsonPayload = zlib.unzipSync(zippedPayload).toString()
        const payload = JSON.parse(jsonPayload);

        // This is quite a lot to log
        // console.log(JSON.stringify(JSON.parse(jsonPayload), null, 2));
        console.log("Log Group: " + payload.logGroup);
        console.log("Log Stream: " + payload.logStream);

        let emailBody = "Error Logs\n";
        emailBody += "\nLog Group: " + payload.logGroup;
        emailBody += "\nLog Stream: " + payload.logStream;
        emailBody += "\nLogs:\n";

        var addedAnyLogMessage = false;
        for (const logEvent of payload.logEvents) {

            if (isKnownAndIgnoredIssue(logEvent.message)) {
                continue;
            } else {
                emailBody += "\n"
                emailBody += logEvent.message;
                addedAnyLogMessage = true;
            }
        }

        if (addedAnyLogMessage) {

            console.log("Sending email");

            await sendEmail({
                toAddresses: EMAIL_LIST.split(','),
                fromAddress: FROM,
                subject: "Errors in " + payload.logGroup,
                textBody: emailBody
            });

        } else {
            console.log("Skipping email since errors were all ignored");
        }
    } else {
        throw new Error("event.awslogs.data was not present");
    }
};

function isKnownAndIgnoredIssue(message: string) {
    for (const knownIssue of KNOWN_ANDIGNORED_ISSUES) {
        if (knownIssue.until.getTime() > NOW) {
            if (message.includes(knownIssue.signature)) {
                console.log("Ignoring error with signature: " + knownIssue.signature);
                return true;
            }
        }
    }
    return false;
}
