import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';

export class NewComicsCron extends cdk.Construct {

    readonly lambda: lambda.Function;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'NewComicsLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'NewComics Errors'
        });

        this.lambda = new nodejslambda.NodejsFunction(this, 'NewComicsLambdaFunction', {
            functionName: 'NewComicsCronLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/comics/new-comics-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.newComics.emailList.join(','),
                FROM: config.newComics.fromEmail,
                SUBJECT: config.newComics.emailSubject,
                ENABLED: config.newComics.enabled,
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq
        });
        // Lambda must be able to send email through SES
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Lambda must be able to retrieve secrets
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

        const schedule = new Rule(this, 'NewComicsSchedule', {
            ruleName: 'NewComicsSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.newComics.rate),
        });
        schedule.addTarget(new LambdaFunction(this.lambda));

    }
}
