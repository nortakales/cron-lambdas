import * as AWS from 'aws-sdk';

const REGION = process.env.REGION!;

const awsOptions: AWS.ConfigurationOptions = {
    region: REGION
};
AWS.config.update(awsOptions);
const SES = new AWS.SES(awsOptions);

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

    var params: AWS.SES.SendEmailRequest = {
        Destination: {
            ToAddresses: options.toAddresses,
        },
        Message: {
            Body: body,
            Subject: { Data: options.subject },
        },
        Source: options.fromAddress,
    };

    await SES.sendEmail(params).promise();
}

export interface SendEmailOptions {
    toAddresses: string[],
    textBody?: string,
    htmlBody?: string,
    subject: string,
    fromAddress: string
}