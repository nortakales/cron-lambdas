import { CloudWatchEventsClient, DeleteRuleCommand, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand } from "@aws-sdk/client-cloudwatch-events";
import { randomUUID } from "crypto";
import { startLambdaLog } from "../utilities/logging";

const REGION = process.env.REGION!;

const events = new CloudWatchEventsClient({ region: REGION });

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

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
};
