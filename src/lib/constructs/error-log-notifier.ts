import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';


export class ErrorLogNotifier extends Construct {

    readonly lambda: lambda.Function;

    constructor(scope: Construct, id: string, prefix: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, prefix + 'ErrorLogNotifierLambda', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: prefix + 'ErrorLogNotifier Errors'
        });
        this.lambda = new nodejslambda.NodejsFunction(this, prefix + 'ErrorLogNotifierLambda', {
            functionName: prefix + 'ErrorLogNotifierLambda',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: __dirname + '/../../lambda/utility-lambda/error-log-notifier.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.base.infrastructureAlertEmail,
                FROM: config.base.errorLogNotifierFrom,
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logGroup: new logs.LogGroup(this, prefix + 'ErrorLogNotifierLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_YEAR
            })
        });

        // Lambda must be able to send email through SES
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

    }
}
