import { CloudWatchEventsClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-cloudwatch-events";
import { randomUUID } from "crypto";

const REGION = process.env.REGION!;

const events = new CloudWatchEventsClient({ region: REGION });

export async function createTimer(triggerTime: Date, lambdaArn: string, description: string, data: any) {

    const timerId = randomUUID();
    data.timerId = timerId;

    const cronExpression = getCronExpression(triggerTime);

    const rule = new PutRuleCommand({
        Name: timerId,
        Description: description,
        ScheduleExpression: `cron(${cronExpression})`
    });

    await events.send(rule);

    const targets = new PutTargetsCommand({
        Rule: timerId,
        Targets: [{
            Id: 'target-' + timerId,
            Arn: lambdaArn,
            Input: JSON.stringify(data)
        },
        {
            Id: 'cleanTarget-' + timerId,
            Arn: 'arn:aws:lambda:us-west-2:787068200846:function:DeleteTimerLambdaFunction',
            Input: JSON.stringify(data)
        }]
    });

    await events.send(targets);
    console.log("Created timer with ID " + timerId);
    return timerId;
}

function getCronExpression(date: Date) {
    const minute = date.getUTCMinutes();
    const hour = date.getUTCHours();
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();

    const expression = `${minute} ${hour} ${day} ${month} ? ${year}`
    console.log('Generated cron expression for ' + date.toUTCString() + ' as ' + expression);
    return expression;
}
