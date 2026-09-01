import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as config from '../../../config/config.json';

/**
 * Factory for the bridge's Lambdas, applying the conventions every function in
 * this repo shares: Node 22, a named log group kept for a year, and an ERROR
 * subscription that fans failures out through the shared error notifier.
 */

export interface BridgeLambdaProps {
    /** File under `src/lambda/icloud-bridge/`, without the `.ts` extension. */
    source: string;
    functionName: string;
    description: string;
    environment: Record<string, string>;
    errorLogNotifierLambda: lambda.Function;
    timeout?: cdk.Duration;
    memorySize?: number;
    deadLetterQueue?: sqs.IQueue;
}

export function bridgeLambda(scope: Construct, id: string, props: BridgeLambdaProps) {

    const lambdaFunction = new nodejslambda.NodejsFunction(scope, id, {
        functionName: props.functionName,
        description: props.description,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../../../lambda/icloud-bridge/${props.source}.ts`,
        handler: 'handler',
        environment: {
            REGION: config.base.region,
            ...props.environment,
        },
        timeout: props.timeout ?? cdk.Duration.seconds(10),
        memorySize: props.memorySize ?? 256,
        retryAttempts: 2,
        deadLetterQueueEnabled: props.deadLetterQueue !== undefined,
        deadLetterQueue: props.deadLetterQueue,
        logGroup: new logs.LogGroup(scope, `${id}LogGroup`, {
            logGroupName: `${props.functionName}LogGroup`,
            retention: logs.RetentionDays.ONE_YEAR,
        }),
    });

    lambdaFunction.logGroup.addSubscriptionFilter(`${id}LogSubscription`, {
        destination: new destinations.LambdaDestination(props.errorLogNotifierLambda),
        filterPattern: logs.FilterPattern.anyTerm('ERROR'),
    });

    return lambdaFunction;
}
