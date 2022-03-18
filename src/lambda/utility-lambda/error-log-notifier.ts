import zlib from 'zlib';
import { sendEmail } from "../emailer";
import { startLambdaLog } from '../utilities/logging';

const REGION = process.env.REGION!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const FROM = process.env.FROM!;

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

        for (const logEvent of payload.logEvents) {
            emailBody += "\n"
            emailBody += logEvent.message;
        }

        await sendEmail({
            toAddresses: EMAIL_LIST.split(','),
            fromAddress: FROM,
            subject: "Errors in " + payload.logGroup,
            textBody: emailBody
        });
    } else {
        throw new Error("event.awslogs.data was not present");
    }
};
