import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'

export class AutoxReminderCron extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const lambdaFunction = new lambda.Function(this, 'AutoxReminderLambdaFunction', {
            functionName: 'AutoxReminderLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('lambda'),
            handler: 'autox-reminder.handler',
            environment: {
                emailList: [
                    'nortakales@gmail.com'
                ].join(','),
                from: 'nortakales@gmail.com',
                subject: 'Evergreen Autox Alert 2'
            }
        });

        const dynamoTable = new dynamodb.Table(this, 'AutoxReminderDynamoTable', {
            partitionKey: {
                name: 'url',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableName: 'autox_reminder_urls',
        });

        dynamoTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'AutoxReminderSchedule', {
            schedule: Schedule.expression('rate(1 minute)'),
        });

        schedule.addTarget(new LambdaFunction(lambdaFunction));
    }
}
