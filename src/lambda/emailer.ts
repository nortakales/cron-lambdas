import * as AWS from 'aws-sdk';

const REGION = process.env.REGION!;

const awsOptions: AWS.ConfigurationOptions = {
    region: REGION
};
AWS.config.update(awsOptions);
const SES = new AWS.SES(awsOptions);

export async function sendEmail(options: SendEmailOptions) {

    console.log("Sending email");

    var params: AWS.SES.SendEmailRequest = {
        Destination: {
            ToAddresses: options.toAddresses,
        },
        Message: {
            Body: {
                Text: { Data: options.body },
            },

            Subject: { Data: options.subject },
        },
        Source: options.fromAddress,
    };

    await SES.sendEmail(params).promise();
}

export interface SendEmailOptions {
    toAddresses: string[],
    body: string,
    subject: string,
    fromAddress: string
}