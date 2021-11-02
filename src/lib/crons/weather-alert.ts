import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';

export class WeatherAlertCron extends cdk.Construct {

    readonly lambda: lambda.Function;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'WeatherAlertLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'WeatherAlert Errors'
        });

        this.lambda = new nodejslambda.NodejsFunction(this, 'WeatherAlertLambdaFunction', {
            functionName: 'WeatherAlertCronLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/weather/weather-alert-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.weatherAlert.emailList.join(','),
                FROM: config.weatherAlert.fromEmail,
                SUBJECT: config.weatherAlert.emailSubject,
                API_KEY_SECRET_OPEN_WEATHER: config.weatherAlert.apiKeySecretOpenWeather,
                LATITUDE: config.weatherAlert.latitude,
                LONGITUDE: config.weatherAlert.longitude,
                ENABLED: config.weatherAlert.enabled,
                REGION: config.base.region,
                TABLE_NAME: config.weatherAlert.trackingDynamoTableName,
                PUSHOVER_CONFIG_SECRET_KEY: config.base.pushoverConfigSecretKey
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq
        });
        // Lambda must be able to send email through SES
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Lambda must be able to retrieve secrets
        this.lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

        const dynamoTable = new dynamodb.Table(this, 'WeatherAlertTrackingDynamoTable', {
            partitionKey: {
                name: 'alertKey',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.weatherAlert.trackingDynamoTableName
        });
        dynamoTable.grantReadWriteData(this.lambda);

        const schedule = new Rule(this, 'WeatherAlertSchedule', {
            ruleName: 'WeatherAlertSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.autoxReminder.rate),
        });
        schedule.addTarget(new LambdaFunction(this.lambda));

        const historyTable = new dynamodb.Table(this, 'WeatherAlertHistoryDynamoTable', {
            partitionKey: {
                name: 'date',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'source',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.weatherAlert.historyDynamoTableName
        });
        historyTable.grantReadWriteData(this.lambda);
    }
}
