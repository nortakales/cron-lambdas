import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import * as path from 'path';

export class WeatherAlertCron extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'WeatherAlertLambdaFunction', {
            functionName: 'WeatherAlertCronLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/weather-alert-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.weatherAlert.emailList.join(','),
                FROM: config.weatherAlert.fromEmail,
                SUBJECT: config.weatherAlert.emailSubject,
                API_KEY: config.weatherAlert.apiKey,
                LATITUDE: config.weatherAlert.latitude,
                LONGITUDE: config.weatherAlert.longitude,
                ENABLED: config.weatherAlert.enabled,
                REGION: config.base.region
            },
            timeout: cdk.Duration.seconds(10)
        });

        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

        // const dynamoTable = new dynamodb.Table(this, 'AutoxReminderDynamoTable', {
        //     partitionKey: {
        //         name: 'url',
        //         type: dynamodb.AttributeType.STRING
        //     },
        //     billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        //     removalPolicy: cdk.RemovalPolicy.RETAIN,
        //     tableName: config.autoxReminder.dynamoTableName
        // });

        // dynamoTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'WeatherAlertSchedule', {
            ruleName: 'WeatherAlertSchedule',
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.autoxReminder.rate),
        });

        schedule.addTarget(new LambdaFunction(lambdaFunction));
    }
}
