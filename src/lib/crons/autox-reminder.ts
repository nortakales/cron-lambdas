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
import { CfnOutput } from '@aws-cdk/core';

export class AutoxReminderCron extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const errorTopic = new sns.Topic(this, 'AutoxReminderErrorTopic', {
            topicName: 'AutoxReminderErrorTopic',
            displayName: 'Autox Reminder Error Notification'
        });
        errorTopic.addSubscription(new subscriptions.EmailSubscription(config.base.infrastructureAlertEmail));

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
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2
        });
        /*
                const lambdaFunction = new lambda.Function(this, 'AutoxReminderLambdaFunction', {
                    functionName: 'AutoxReminderLambda',
                    runtime: lambda.Runtime.NODEJS_14_X,
                    code: lambda.Code.fromAsset('lambda'),
                    handler: 'autox-reminder-lambda.handler',
                    environment: {
                        EMAIL_LIST: "nortakales@gmail.com",
                        FROM: "nortakales@gmail.com",
                        SUBJECT: "Test",
                        TABLE_NAME: config.autoxReminder.dynamoTableName
                    }
                    /*
                    environment: {
                        EMAIL_LIST: config.autoxReminder.emailList.join(','),
                        FROM: config.autoxReminder.fromEmail,
                        SUBJECT: config.autoxReminder.emailSubject,
                        TABLE_NAME: config.autoxReminder.dynamoTableName
                    }
                    
                });*/


        const alarm = lambdaFunction.metricErrors().createAlarm(this, 'AutoxReminderErrorsMonitor', {
            alarmName: 'AutoxReminderErrorsMonitor',
            threshold: 1,
            evaluationPeriods: 1,
        });
        alarm.addAlarmAction(new actions.SnsAction(errorTopic));

        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
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
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
        });

        pushNotificationLambdaFunction.addPermission('CloudWatchEventsPermission', {
            principal: new iam.ServicePrincipal('events.amazonaws.com')
        });
    }
}
