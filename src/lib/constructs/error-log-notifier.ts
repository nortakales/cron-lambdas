import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import * as destinations from '@aws-cdk/aws-logs-destinations';
import * as logs from '@aws-cdk/aws-logs';


export class ErrorLogNotifier extends cdk.Construct {

    readonly lambda: lambda.Function;

    constructor(scope: cdk.Construct, id: string, prefix: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, prefix + 'ErrorLogNotifierLambda', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: prefix + 'ErrorLogNotifier Errors'
        });
        this.lambda = new nodejslambda.NodejsFunction(this, prefix + 'ErrorLogNotifierLambda', {
            functionName: prefix + 'ErrorLogNotifierLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/utility-lambda/error-log-notifier.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.base.infrastructureAlertEmail,
                FROM: config.base.infrastructureAlertEmail,
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR
        });

        // Lambda must be able to send email through SES
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

    }
}
