
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from '../../config/config.json';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';

export class AlexaSkillLambda extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
        super(scope, id);


        const lambdaFunction = new nodejslambda.NodejsFunction(this, 'AlexaSkillLambdaFunction', {
            functionName: 'AlexaSkillLambda',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: __dirname + '/../../lambda/alexa/alexa-skill.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region,
                SWITCHBOT_CREDENTIALS_NAME: config.base.switchbotCredentials,
            },
            timeout: cdk.Duration.seconds(5),
            retryAttempts: 2,
            deadLetterQueueEnabled: false,
            logGroup: new logs.LogGroup(this, 'AlexaSkillLambdaFunction-LogGroup', {
                logGroupName: 'AlexaSkillLambdaFunction-LogGroup',
                retention: logs.RetentionDays.ONE_YEAR
            })
        });
        // Lambda must be able to retrieve secrets
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));
        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter(id + '-LambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });
        // lambdaFunction.addPermission('AlexaInvocationPermission', {
        //     //principal: new iam.ServicePrincipal('alexa-skills-kit.amazon.com'),
        //     principal: new iam.ServicePrincipal('alexa-appkit.amazon.com'),
        //     //action: 'lambda:InvokeFunction',
        //     eventSourceToken: 'amzn1.ask.skill.9ce748c1-2381-424b-b90a-e7f64b6aefcd',
        // });
    }
}