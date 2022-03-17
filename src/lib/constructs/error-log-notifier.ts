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

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'ErrorLogNotifierLambda', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'ErrorLogNotifier Errors'
        });
        this.lambda = new nodejslambda.NodejsFunction(this, 'ErrorLogNotifierLambda', {
            functionName: 'ErrorLogNotifierLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/utility-lambda/error-log-notifier.ts',
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
                API_KEY_SECRET_VISUAL_CROSSING: config.weatherAlert.apiKeySecretVisualCrossing
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq
        });
    }
}
