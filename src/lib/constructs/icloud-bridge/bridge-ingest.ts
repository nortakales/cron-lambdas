import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as config from '../../../config/config.json';
// Imported from the Lambda source so the rule and the publishers cannot drift.
import { AGENT_EVENT_SOURCE } from '../../../lambda/icloud-bridge/shared/model';
import { DLQWithMonitor } from '../dlq-with-monitor';
import { IcloudBridgeCore } from './bridge-core';
import { bridgeLambda } from './bridge-lambda';

/**
 * Read path terminus: the EventBridge rule that catches everything the Mac agent
 * publishes, writes it into the DynamoDB mirror, and re-publishes it on the SNS
 * fan-out topic for any other subscriber.
 *
 * The rule matches on `source` alone rather than on each `detail-type`, so a new
 * provider (Calendar, Contacts, ...) starts flowing without touching this wiring.
 */
export class IcloudBridgeIngest extends Construct {

    readonly lambda: lambda.Function;

    constructor(
        scope: Construct,
        id: string,
        core: IcloudBridgeCore,
        errorLogNotifierLambda: lambda.Function,
    ) {
        super(scope, id);

        const dlqWithMonitor = new DLQWithMonitor(this, 'IcloudBridgeIngest', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'iCloud Bridge Ingest Errors',
        });

        this.lambda = bridgeLambda(this, 'IngestLambda', {
            source: 'ingest',
            functionName: 'IcloudBridgeIngestLambda',
            description: 'Writes iCloud bridge read-path events into the DynamoDB mirror',
            environment: {
                MESSAGES_TABLE_NAME: core.messagesTable.tableName,
                REMINDERS_TABLE_NAME: core.remindersTable.tableName,
                MESSAGE_RETENTION_DAYS: config.icloudBridge.messageRetentionDays,
            },
            errorLogNotifierLambda,
            // A cold-start backfill can carry a few hundred messages in one event.
            timeout: cdk.Duration.seconds(60),
            deadLetterQueue: dlqWithMonitor.dlq,
        });

        core.messagesTable.grantReadWriteData(this.lambda);
        core.remindersTable.grantReadWriteData(this.lambda);

        new events.Rule(this, 'IngestRule', {
            ruleName: 'IcloudBridgeIngestRule',
            description: 'Routes every event published by the iCloud bridge Mac agent',
            eventBus: core.eventBus,
            eventPattern: {
                source: [AGENT_EVENT_SOURCE],
            },
            targets: [
                new targets.LambdaFunction(this.lambda, { deadLetterQueue: dlqWithMonitor.dlq }),
                new targets.SnsTopic(core.ingestTopic),
            ],
        });
    }
}
