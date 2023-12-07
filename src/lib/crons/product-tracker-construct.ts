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

export class ProductTrackerCron extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'ProductTrackerLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'ProductTracker Errors'
        });

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'ProductTrackerLambdaFunction', {
            functionName: 'ProductTrackerLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/product/product-tracker-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.productTracker.emailList.join(','),
                FROM: config.productTracker.fromEmail,
                SUBJECT: config.productTracker.emailSubject,
                PRODUCT_TABLE_NAME: config.productTracker.productsDynamoTableName,
                PRODUCT_HISTORY_TABLE_NAME: config.productTracker.productHistoryDynamoTableName,
                ENABLED: config.productTracker.enabled,
                REGION: config.base.region,
                DYNAMO_ACCESS_ENDPOINT: config.base.dynamoAccessEndpoint,
                API_KEY_SECRET_SCRAPERAPI: config.base.apiKeyScraperApi,
            },
            timeout: cdk.Duration.minutes(10),
            memorySize: 512,
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR,
            bundling: {
                nodeModules: ['node-html-parser']
            }
        });
        // Lambda must be able to send email through SES
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // // Lambda must be able to retrieve secrets
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // // Lambda must be able to create Cloudwatch rules and add targets
        // lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
        //     actions: ['events:PutRule', 'events:PutTargets'],
        //     resources: ['arn:aws:events:*:*:rule/*'],
        //     effect: iam.Effect.ALLOW,
        // }));
        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter('ProductTrackerLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

        const productsTable = new dynamodb.Table(this, 'ProductTrackerProductsDynamoTable', {
            partitionKey: {
                name: 'title',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.productTracker.productsDynamoTableName
        });
        productsTable.grantReadWriteData(lambdaFunction);
        productsTable.addGlobalSecondaryIndex({
            indexName: 'urlKey-index',
            partitionKey: {
                name: 'urlKey',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'website',
                type: dynamodb.AttributeType.STRING
            }
        });

        const productHistoryTable = new dynamodb.Table(this, 'ProductTrackerProductHistoryDynamoTable', {
            partitionKey: {
                name: 'title',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'timestamp',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.productTracker.productHistoryDynamoTableName
        });
        productHistoryTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'ProductTrackerSchedule', {
            ruleName: 'ProductTrackerSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.productTracker.rate),
        });
        schedule.addTarget(new LambdaFunction(lambdaFunction));
    }
}
