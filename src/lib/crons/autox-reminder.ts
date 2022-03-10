import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import { ComparisonOperator } from '@aws-cdk/aws-cloudwatch';

export class AutoxReminderCron extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'AutoxReminderLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'AutoxReminder Errors'
        });

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'AutoxReminderLambdaFunction', {
            functionName: 'AutoxReminderLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/autox/autox-reminder-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.autoxReminder.emailList.join(','),
                FROM: config.autoxReminder.fromEmail,
                SUBJECT: config.autoxReminder.emailSubject,
                TABLE_NAME: config.autoxReminder.dynamoTableName,
                ENABLED: config.autoxReminder.enabled,
                REGION: config.base.region,
                PUSH_NOTIFICATION_LAMBDA_ARN: config.autoxReminder.pushNotificationLambdaArn,
                PUSHOVER_CONFIG_SECRET_KEY: config.base.pushoverConfigSecretKey
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq
        });
        // Lambda must be able to send email through SES
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Lambda must be able to retrieve secrets
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Lambda must be able to create Cloudwatch rules and add targets
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['events:PutRule', 'events:PutTarget'],
            resources: ['arn:aws:events:*:*:rule/*'],
            effect: iam.Effect.ALLOW,
        }));

        const dynamoTable = new dynamodb.Table(this, 'AutoxReminderDynamoTable', {
            partitionKey: {
                name: 'url',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.autoxReminder.dynamoTableName
        });
        dynamoTable.addGlobalSecondaryIndex({
            indexName: 'id-index',
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            }
        });
        dynamoTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'AutoxReminderSchedule', {
            ruleName: 'AutoxReminderSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.autoxReminder.rate),
        });
        schedule.addTarget(new LambdaFunction(lambdaFunction));

        const dlqWithMonitorForPush = new DLQWithMonitor(this, 'AutoxPushLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'AutoxPush Errors',
        });

        const pushNotificationLambdaFunction = new nodejslambda.NodejsFunction(this, 'AutoxPushLambdaFunction', {
            functionName: 'AutoxPushLambdaFunction',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/autox/autox-push-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.autoxReminder.emailList.join(','),
                FROM: config.autoxReminder.fromEmail,
                SUBJECT: config.autoxReminder.emailSubject,
                TABLE_NAME: config.autoxReminder.dynamoTableName,
                ENABLED: config.autoxReminder.enabled,
                REGION: config.base.region,
                PUSHOVER_CONFIG_SECRET_KEY: config.base.pushoverConfigSecretKey
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitorForPush.dlq
        });
        // Cloudwatch must be able to invoke this Lambda
        pushNotificationLambdaFunction.addPermission('CloudWatchEventsPermission', {
            principal: new iam.ServicePrincipal('events.amazonaws.com')
        });
        // Lambda must be able to retrieve secrets
        pushNotificationLambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
    }
}
