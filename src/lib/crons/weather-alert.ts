import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import * as config from '../../config/config.json'
import { DLQWithMonitor } from '../constructs/dlq-with-monitor';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class WeatherAlertCron extends Construct {

    readonly lambda: lambda.Function;

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
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
                LATITUDE: config.weatherAlert.latitude,
                LONGITUDE: config.weatherAlert.longitude,
                ENABLED: config.weatherAlert.enabled,
                REGION: config.base.region,
                TABLE_NAME: config.weatherAlert.trackingDynamoTableName,
                PUSHOVER_CONFIG_SECRET_KEY: config.base.pushoverConfigSecretKey,
                API_KEY_SECRET_OPEN_WEATHER: config.weatherAlert.apiKeySecretOpenWeather,
                API_KEY_SECRET_TOMORROW_IO: config.weatherAlert.apiKeySecretTomorrowIo,
                API_KEY_SECRET_VISUAL_CROSSING: config.weatherAlert.apiKeySecretVisualCrossing,
                API_CREDENTIALS_SECRET_METEOMATICS: config.weatherAlert.apiCredentialsSecretMeteomatics,
                API_KEY_ACCUWEATHER: config.weatherAlert.apiKeyAccuWeather
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.TWO_YEARS
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

        // Stream logs to the error notifier
        this.lambda.logGroup.addSubscriptionFilter('WeatherAlertLambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

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
