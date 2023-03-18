import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as config from '../../config/config.json';
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class AutoxReminderCron extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
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
            timeout: cdk.Duration.seconds(60),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR
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
            actions: ['events:PutRule', 'events:PutTargets'],
            resources: ['arn:aws:events:*:*:rule/*'],
            effect: iam.Effect.ALLOW,
        }));
        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter('AutoxReminderLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

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
            deadLetterQueue: dlqWithMonitorForPush.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR
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
        // Stream logs to the error notifier
        pushNotificationLambdaFunction.logGroup.addSubscriptionFilter('AutoxPushLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });
    }
}
