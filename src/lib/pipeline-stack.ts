import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { DeployCronLambdaStage } from './pipeline-stage';
import { SimpleSynthAction, CdkPipeline } from "@aws-cdk/pipelines";

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
                repo: "cron-lambdas"
            }),

            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact,
                cloudAssemblyArtifact,
                installCommand: 'npm i -g npm@7 && npm ci', // Upgrading to npm 7 is necessary or npm ci fails
                buildCommand: 'npm run build'

            })
        })

        const deploy = new DeployCronLambdaStage(this, 'DeployCronLambdaStage');
        pipeline.addApplicationStage(deploy);
    }
}