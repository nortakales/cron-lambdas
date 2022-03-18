import * as cdk from '@aws-cdk/core';
import { DeployCronLambdaStage } from './deploy-cron-lambda-stage';
import { CodePipeline, ShellStep, CodePipelineSource } from "@aws-cdk/pipelines";
import * as notifications from '@aws-cdk/aws-codestarnotifications';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as config from '../config/config.json'
import { DLQWithMonitor } from './constructs/dlq-with-monitor';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';

export class CDKPipelineStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const githubSource = CodePipelineSource.gitHub('nortakales/cron-lambdas', 'main', {
            authentication: cdk.SecretValue.secretsManager('cdk-token'),
        });

        const pipeline = new CodePipeline(this, 'CronLambdasCDKPipeline', {
            pipelineName: 'CronLambdasCDKPipeline',
            synth: new ShellStep('Synth', {
                input: githubSource,
                installCommands: [
                    "npm i -g npm@7", // Upgrading to npm 7 is necessary or npm ci fails
                    "npm ci",
                ],
                commands: [
                    "npm run build",
                    'npx cdk synth'
                ]
            }),
            selfMutation: true
        });

        const deploy = new DeployCronLambdaStage(this, 'DeployCronLambdaStage');
        pipeline.addStage(deploy);

        pipeline.buildPipeline();

        const dlqWithMonitor = new DLQWithMonitor(this, 'CronPipelineNotificationLambdaFunction', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'PipelineNotification Errors'
        });

        const pipelineNotificationLambda = new nodejslambda.NodejsFunction(this, 'CronPipelineNotificationLambdaFunction', {
            functionName: 'CronPipelineNotificationLambda',
            runtime: lambda.Runtime.NODEJS_14_X,
            entry: __dirname + '/../lambda/pipeline/pipeline-notification-lambda.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region,
                PUSHOVER_CONFIG_SECRET_KEY: config.base.pushoverConfigSecretKey
            },
            timeout: cdk.Duration.seconds(10),
            retryAttempts: 2,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlqWithMonitor.dlq,
            logRetention: logs.RetentionDays.ONE_YEAR
        });
        // Lambda must be able to retrieve secrets
        pipelineNotificationLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
        }));

        const pipelineTopic = new sns.Topic(this, 'CronLambdaPipelineNotificationTopic', {
            topicName: 'CronLambdaPipelineNotificationTopic',
            displayName: 'Cron Lambda Pipeline Notification'
        });
        pipelineTopic.addSubscription(new subscriptions.LambdaSubscription(pipelineNotificationLambda));

        new notifications.NotificationRule(this, 'CronLambdaPipelineNotificationRule', {
            notificationRuleName: 'CronLambdaPipelineNotificationRule',
            source: pipeline.pipeline,
            events: [
                'codepipeline-pipeline-action-execution-failed',
                'codepipeline-pipeline-stage-execution-failed',
                'codepipeline-pipeline-pipeline-execution-failed',
                'codepipeline-pipeline-manual-approval-failed',
                'codepipeline-pipeline-manual-approval-needed',
                'codepipeline-pipeline-pipeline-execution-succeeded'
            ],
            targets: [
                pipelineTopic
            ],
        });
    }
}