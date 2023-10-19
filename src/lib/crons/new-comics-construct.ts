import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class NewComicsCron extends Construct {

    readonly lambda: lambda.Function;

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
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
                REGION: config.base.region,
                API_KEY_SECRET_SCRAPERAPI: config.base.apiKeyScraperApi,
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR,
            bundling: {
                nodeModules: ['node-html-parser']
            }
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
        // Stream logs to the error notifier
        this.lambda.logGroup.addSubscriptionFilter('NewComicsLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

        const schedule = new Rule(this, 'NewComicsSchedule', {
            ruleName: 'NewComicsSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.newComics.rate),
        });
        schedule.addTarget(new LambdaFunction(this.lambda));

    }
}
