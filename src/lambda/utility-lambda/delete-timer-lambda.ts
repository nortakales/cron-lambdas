import { CloudWatchEventsClient, DeleteRuleCommand, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand } from "@aws-sdk/client-cloudwatch-events";
import { randomUUID } from "crypto";

const REGION = process.env.REGION!;

const events = new CloudWatchEventsClient({ region: REGION });

exports.handler = async (event: any = {}, context: any = {}) => {
    console.log("Running --------------------");
    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    const timerId = event.timerId;

    // Must first delete targets
    // Target IDs come from the events client that creates these targets
    await events.send(new RemoveTargetsCommand({
        Rule: timerId,
        Ids: [
            'target-' + timerId,
            'cleanTarget-' + timerId
        ],
    }));

    // Then delete rule
    await events.send(new DeleteRuleCommand({
        Name: timerId
    }));

    console.log("Done --------------------");
};
