import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import { Schedule, Rule } from '@aws-cdk/aws-events'
import { LambdaFunction } from '@aws-cdk/aws-events-targets'

export class AutoxReminderCron extends cdk.Construct {

    private tableName = 'autox_reminder_urls';

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const lambdaFunction = new lambda.Function(this, 'AutoxReminderLambdaFunction', {
            functionName: 'AutoxReminderLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('lambda'),
            handler: 'autox-reminder.handler',
            environment: {
                emailList: [
                    'nortakales@gmail.com',
                    'kurt@hammondjp.com',
                    'adamsdb@outlook.com',
                    'michelegraaff@outlook.com',
                    'sungcampbell@gmail.com',
                    'nathan.olotoa@hotmail.com'
                ].join(','),
                from: 'nortakales@gmail.com',
                subject: 'Evergreen Autox Alert',
                tableName: this.tableName
            }
        });

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
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableName: this.tableName
        });

        dynamoTable.grantReadWriteData(lambdaFunction);

        const schedule = new Rule(this, 'AutoxReminderSchedule', {
            schedule: Schedule.expression('rate(1 hour)'),
        });

        schedule.addTarget(new LambdaFunction(lambdaFunction));

    }
}
