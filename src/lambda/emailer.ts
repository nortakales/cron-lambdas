import { SESv2Client, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import { send } from "process";

const REGION = process.env.REGION!;

const SES = new SESv2Client({
    region: REGION,
});

export async function sendEmail(options: SendEmailOptions) {

    console.log("Sending email");

    let body;

    if (options.textBody && options.htmlBody) {
        body = {
            Text: { Data: options.textBody },
            Html: { Data: options.htmlBody }
        }
    } else if (options.textBody) {
        body = {
            Text: { Data: options.textBody }
        }
    } else if (options.htmlBody) {
        body = {
            Html: { Data: options.htmlBody }
        }
    } else {
        throw new Error("Must specify either text or html email body");
    }

    var params: SendEmailCommandInput = {
        FromEmailAddress: options.fromAddress,
        Destination: {
            ToAddresses: options.toAddresses,
        },
        Content: {
            Simple: {
                Subject: {
                    Data: options.subject,
                    Charset: 'UTF-8'
                },
                Body: body
            }
        },

    };

    await SES.send(new SendEmailCommand(params));
}

export interface SendEmailOptions {
    toAddresses: string[],
    textBody?: string,
    htmlBody?: string,
    subject: string,
    fromAddress: string
}

// sendEmail({
//     toAddresses: ['nortakales@gmail.com'],
//     fromAddress: 'automation@nortakales.com',
//     subject: 'Test Email',
//     textBody: 'This is a test email'
// })
//     .then(() => { console.log("Email sent") })
//     .catch(err => { console.error("Error sending email", err) });