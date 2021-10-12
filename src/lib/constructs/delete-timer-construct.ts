import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';

import * as config from '../../config/config.json'



export class DeleteTimerConstruct extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const snsTopic = new sns.Topic(this, 'DeleteTimerLambdaFunction-DLQ-Topic', {
            topicName: 'DeleteTimerLambdaFunction-DLQ-Topic',
            displayName: 'Delete Timer Error Notification'
        });
        snsTopic.addSubscription(new subscriptions.EmailSubscription(config.base.infrastructureAlertEmail));

        const dlq = new sqs.Queue(this, 'DeleteTimerLambdaFunction-DLQ', {
            queueName: 'DeleteTimerLambdaFunction-DLQ',
            retentionPeriod: cdk.Duration.days(14)
        });

        const alarm = dlq.metricApproximateNumberOfMessagesVisible().createAlarm(this, 'DeleteTimerLambdaFunction-DLQ-Monitor', {
            alarmName: 'DeleteTimerLambdaFunction-DLQ-Monitor',
            threshold: 1,
            evaluationPeriods: 1,
        });
        alarm.addAlarmAction(new actions.SnsAction(snsTopic));

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'DeleteTimerLambdaFunction', {
            functionName: 'DeleteTimerLambdaFunction',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/utility-lambda/delete-timer-lambda.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlq
        });

        // Make sure EventBridge can call this Lambda
        lambdaFunction.addPermission('DeleteTimerLambdaFunction-CloudWatchEventsPermission', {
            principal: new iam.ServicePrincipal('events.amazonaws.com')
        });
    }
}