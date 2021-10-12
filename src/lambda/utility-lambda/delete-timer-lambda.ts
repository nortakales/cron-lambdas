import { CloudWatchEventsClient, DeleteRuleCommand, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-cloudwatch-events";
import { randomUUID } from "crypto";

const REGION = process.env.REGION!;

const events = new CloudWatchEventsClient({ region: REGION });

exports.handler = async (event: any = {}, context: any = {}) => {
    console.log("Running --------------------");
    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    const timerId = event.timerId;

    const deleteRule = new DeleteRuleCommand({
        Name: timerId
    });

    await events.send(deleteRule);

    console.log("Done --------------------");
};
