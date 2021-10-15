import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as iam from '@aws-cdk/aws-iam';
import * as apigateway from "@aws-cdk/aws-apigateway";

import * as config from '../../config/config.json'
import { DLQWithMonitor } from './dlq-with-monitor';
import { ComparisonOperator } from '@aws-cdk/aws-cloudwatch';

export class AdhocWeatherReportAPI extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string, lambda: lambda.Function) {
        super(scope, id);

        const api = new apigateway.LambdaRestApi(this, id + "-AdhocAPI", {
            handler: lambda,
            restApiName: "Adhoc Weather Report",
            description: "Generates an adhoc weather report.",
        });










        // const dlqWithMonitor = new DLQWithMonitor(this, 'DeleteTimerLambdaFunction', {
        //     notificationEmail: config.base.infrastructureAlertEmail,
        //     topicDisplayName: 'DeleteTimer Errors'
        // });

        // const lambdaFunction = new nodejslambda.NodejsFunction(this, 'DeleteTimerLambdaFunction', {
        //     functionName: 'DeleteTimerLambdaFunction',
        //     runtime: lambda.Runtime.NODEJS_14_X,
        //     entry: __dirname + '/../../lambda/utility-lambda/delete-timer-lambda.ts',
        //     handler: 'handler',
        //     environment: {
        //         REGION: config.base.region
        //     },
        //     timeout: cdk.Duration.seconds(10),
        //     retryAttempts: 2,
        //     deadLetterQueueEnabled: true,
        //     deadLetterQueue: dlqWithMonitor.dlq
        // });

        // // Make sure EventBridge can call this Lambda
        // lambdaFunction.addPermission('DeleteTimerLambdaFunction-CloudWatchEventsPermission', {
        //     principal: new iam.ServicePrincipal('events.amazonaws.com')
        // });

        // // Make sure the Lambda can delete EventBridge rules
        // lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
        //     effect: iam.Effect.ALLOW,
        //     actions: ['events:*'],
        //     resources: ['arn:aws:events:*:*:rule/*']
        // }))
    }
}