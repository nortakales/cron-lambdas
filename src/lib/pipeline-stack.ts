import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { DeployCronLambdaStage } from './deploy-cron-lambda-stage';
import { SimpleSynthAction, CdkPipeline } from "@aws-cdk/pipelines";
import * as notifications from '@aws-cdk/aws-codestarnotifications';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as config from '../config/config.json'

export class CDKPipelineStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Defines the artifact representing the sourcecode
        const sourceArtifact = new codepipeline.Artifact();
        // Defines the artifact representing the cloud assembly 
        // (cloudformation template + all other assets)
        const cloudAssemblyArtifact = new codepipeline.Artifact();

        const githubAuth = cdk.SecretValue.secretsManager('cdk-token');

        const pipeline = new CdkPipeline(this, 'CronLambdasCDKPipeline', {
            pipelineName: 'CronLambdasCDKPipeline',
            cloudAssemblyArtifact,

            // Generates the source artifact from the repo we created in the last step
            sourceAction: new codepipeline_actions.GitHubSourceAction({
                actionName: 'GitHub',
                output: sourceArtifact,
                oauthToken: githubAuth,
                owner: "nortakales",
                repo: "cron-lambdas",
                branch: "main"
            }),

            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact,
                cloudAssemblyArtifact,
                installCommand: 'npm i -g npm@7 && npm ci', // Upgrading to npm 7 is necessary or npm ci fails
                buildCommand: 'npm run build'
            })
        });

        const deploy = new DeployCronLambdaStage(this, 'DeployCronLambdaStage');
        pipeline.addApplicationStage(deploy);


        const pipelineTopic = new sns.Topic(this, 'CronLambdaPipelineNotificationTopic', {
            topicName: 'CronLambdaPipelineNotificationTopic',
            displayName: 'Cron Lambda Pipeline Notification'
        });
        pipelineTopic.addSubscription(new subscriptions.EmailSubscription(config.base.infrastructureAlertEmail));

        new notifications.NotificationRule(this, 'CronLambdaPipelineNotificationRule', {
            notificationRuleName: 'CronLambdaPipelineNotificationRule',
            source: pipeline.codePipeline,
            events: [
                'codepipeline-pipeline-action-execution-failed',
                'codepipeline-pipeline-stage-execution-failed',
                'codepipeline-pipeline-pipeline-execution-failed',
                'codepipeline-pipeline-manual-approval-failed',
                'codepipeline-pipeline-manual-approval-needed',

                // Success was getting annoying
                //'codepipeline-pipeline-pipeline-execution-succeeded'
            ],
            targets: [
                pipelineTopic
            ],
        });
    }
}