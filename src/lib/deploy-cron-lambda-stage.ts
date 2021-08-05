import { CronLambdaStack } from './cron-lambda-stack';
import { Stage, Construct, StageProps } from '@aws-cdk/core';

export class DeployCronLambdaStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);

        new CronLambdaStack(this, 'CronLambdaStack');
    }
}