import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'
import * as config from '../../config/config.json'
import * as path from 'path';

export class AutoxReminderCron extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'AutoxReminderLambdaFunction', {
            functionName: 'AutoxReminderLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../../lambda/autox-reminder-lambda.ts',
            handler: 'handler',
            environment: {
                EMAIL_LIST: config.autoxReminder.emailList.join(','),
                FROM: config.autoxReminder.fromEmail,
                SUBJECT: config.autoxReminder.emailSubject,
                TABLE_NAME: config.autoxReminder.dynamoTableName,
                REGION: "us-west-2"
            }
        });
        /*
                const lambdaFunction = new lambda.Function(this, 'AutoxReminderLambdaFunction', {
                    functionName: 'AutoxReminderLambda',
                    runtime: lambda.Runtime.NODEJS_14_X,
                    code: lambda.Code.fromAsset('lambda'),
                    handler: 'autox-reminder-lambda.handler',
                    environment: {
                        EMAIL_LIST: "nortakales@gmail.com",
                        FROM: "nortakales@gmail.com",
                        SUBJECT: "Test",
                        TABLE_NAME: config.autoxReminder.dynamoTableName
                    }
                    /*
                    environment: {
                        EMAIL_LIST: config.autoxReminder.emailList.join(','),
                        FROM: config.autoxReminder.fromEmail,
                        SUBJECT: config.autoxReminder.emailSubject,
                        TABLE_NAME: config.autoxReminder.dynamoTableName
                    }
                    
                });*/

        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

        const dynamoTable = new dynamodb.Table(this, 'AutoxReminderDynamoTable', {
            partitionKey: {
                name: 'url',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: config.autoxReminder.dynamoTableName
        });

        dynamoTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'AutoxReminderSchedule', {
            // Supports minute(s), hour(s), day(s):
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
            schedule: Schedule.expression(config.autoxReminder.rate),
        });

        schedule.addTarget(new LambdaFunction(lambdaFunction));
    }
}
