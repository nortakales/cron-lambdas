
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from '../../config/config.json'
import { DLQWithMonitor } from './dlq-with-monitor';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

export class DeleteTimerConstruct extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'DeleteTimerLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'DeleteTimer Errors'
        });

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'DeleteTimerLambdaFunction', {
            functionName: 'DeleteTimerLambdaFunction',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: __dirname + '/../../lambda/utility-lambda/delete-timer-lambda.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region
            },
            timeout: Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR
        });

        // Make sure EventBridge can call this Lambda
        lambdaFunction.addPermission('DeleteTimerLambdaFunction-CloudWatchEventsPermission', {
            principal: new iam.ServicePrincipal('events.amazonaws.com')
        });

        // Make sure the Lambda can delete EventBridge rules
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['events:*'],
            resources: ['arn:aws:events:*:*:rule/*']
        }));

        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter('DeleteTimerLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });
    }
}