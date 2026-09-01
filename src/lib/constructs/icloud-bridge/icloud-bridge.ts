import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IcloudBridgeApi } from './bridge-api';
import { IcloudBridgeCore } from './bridge-core';
import { IcloudBridgeIngest } from './bridge-ingest';

/**
 * The AWS half of the iCloud bridge (docs/icloud-bridge-spec.md).
 *
 * Reads flow Mac -> EventBridge -> ingest Lambda -> DynamoDB -> consumer API.
 * Writes flow consumer API -> DynamoDB + SQS -> Mac agent, which reports status
 * back to DynamoDB. The Mac never accepts an inbound connection.
 */
export class IcloudBridge extends Construct {

    readonly core: IcloudBridgeCore;
    readonly api: IcloudBridgeApi;
    readonly ingest: IcloudBridgeIngest;

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function) {
        super(scope, id);

        this.core = new IcloudBridgeCore(this, 'Core');
        this.ingest = new IcloudBridgeIngest(this, 'Ingest', this.core, errorLogNotifierLambda);
        this.api = new IcloudBridgeApi(this, 'Api', this.core, errorLogNotifierLambda);
    }
}
