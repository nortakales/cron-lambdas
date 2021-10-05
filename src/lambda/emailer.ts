import * as AWS from 'aws-sdk';

const REGION = process.env.REGION!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;

const awsOptions: AWS.ConfigurationOptions = {
    region: REGION
};
AWS.config.update(awsOptions);
const SES = new AWS.SES(awsOptions);

export async function sendEmail(body: string) {

    console.log("Sending email");

    var params: AWS.SES.SendEmailRequest = {
        Destination: {
            ToAddresses: EMAIL_LIST.split(","),
        },
        Message: {
            Body: {
                Text: { Data: body },
            },

            Subject: { Data: SUBJECT },
        },
        Source: FROM,
    };

    await SES.sendEmail(params).promise();
}