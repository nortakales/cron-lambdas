
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from '../../config/config.json';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';

export class DynamoDBAccessAPI extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
        super(scope, id);

        const logGroup = new logs.LogGroup(this, id + "-AccessLogs");

        const api = new apigateway.RestApi(this, id + "-API", {
            restApiName: "DynamoDB Access API",
            description: "Allows API access to various DynamoDB operations and all tables",
            deployOptions: {
                metricsEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields()
            }
        });

        const lambdaFunction = new nodejslambda.NodejsFunction(this, id + '-Lambda', {
            functionName: 'DynamoDBAccessLambdaFunction',
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: __dirname + '/../../lambda/dynamodb/dynamodb-access-lambda.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(5),
            retryAttempts: 2,
            deadLetterQueueEnabled: false,
            logRetention: logs.RetentionDays.ONE_YEAR
        });
        // Lambda must be able to do all DynamoDB operations to all tables
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:*'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter(id + '-LambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

        const integration = new apigateway.LambdaIntegration(lambdaFunction, {
            requestTemplates: {
                "application/json": '{ "statusCode": "200" }'
            } // TODO is this even needed? what does it do?
        });

        api.root.addMethod("POST", integration);
        api.root.addMethod("GET", integration);
    }
}