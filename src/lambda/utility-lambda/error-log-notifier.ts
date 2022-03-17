import { CloudWatchEventsClient, DeleteRuleCommand, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand } from "@aws-sdk/client-cloudwatch-events";
import { randomUUID } from "crypto";
import zlib from 'zlib';

const REGION = process.env.REGION!;

//const events = new CloudWatchEventsClient({ region: REGION });

exports.handler = async (event: any = {}, context: any = {}) => {
    console.log("Running --------------------");
    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    if (event.awslogs && event.awslogs.data) {
        const zippedPayload = Buffer.from(event.awslogs.data, 'base64');
        const jsonPayload = zlib.unzipSync(zippedPayload).toString()

        console.log(JSON.stringify(JSON.parse(jsonPayload), null, 2));

        // const logevents = JSON.parse(zlib.unzipSync(jsonPayload).toString()).logEvents;

        // for (const logevent of logevents) {
        //     const log = JSON.parse(logevent.message);
        //     console.log(log);
        // }
    }

    console.log("Done --------------------");
};


// TODO check log retention oin ALL lambdas !!!