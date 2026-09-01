import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import * as config from '../../../config/config.json';
import { DLQWithMonitor } from '../dlq-with-monitor';

/**
 * Storage, messaging and identity for the iCloud bridge — everything the API and
 * ingest constructs build on, and everything the Mac agent talks to.
 */

/** Messages by recency across every chat (constant partition key). */
export const MESSAGE_TIMELINE_INDEX = 'timeline-index';
/** Messages by who sent them. */
export const MESSAGE_SENDER_INDEX = 'sender-index';
/** Reminders by completion state, ordered by due date. */
export const REMINDER_DUE_INDEX = 'due-index';

/** How long the agent has to execute a command before SQS redelivers it. */
const COMMAND_VISIBILITY_TIMEOUT = cdk.Duration.minutes(2);
/** Deliveries before a command is parked on the DLQ (spec section 8). */
const COMMAND_MAX_RECEIVE_COUNT = 5;

/** The agent beats once a minute; alarm after this many consecutive silent minutes. */
const HEARTBEAT_ALARM_MINUTES = 10;

export class IcloudBridgeCore extends Construct {

    readonly messagesTable: dynamodb.Table;
    readonly remindersTable: dynamodb.Table;
    readonly commandsTable: dynamodb.Table;
    readonly syncStateTable: dynamodb.Table;

    readonly eventBus: events.EventBus;
    readonly ingestTopic: sns.Topic;
    readonly commandQueue: sqs.Queue;

    readonly apiKeySecret: secretsmanager.Secret;
    readonly blueBubblesPasswordSecret: secretsmanager.Secret;
    readonly agentCredentialsSecret: secretsmanager.Secret;

    readonly agentUser: iam.User;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // --- tables ---------------------------------------------------------

        this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
            tableName: config.icloudBridge.messagesTableName,
            partitionKey: { name: 'chatId', type: dynamodb.AttributeType.STRING },
            // `${createdAt}#${messageGuid}`: ISO8601 sorts lexicographically, and the
            // GUID makes the key unique for messages sharing a timestamp.
            sortKey: { name: 'tsGuid', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            // Enforces the message retention window without any code running.
            timeToLiveAttribute: 'ttl',
        });
        this.messagesTable.addGlobalSecondaryIndex({
            indexName: MESSAGE_TIMELINE_INDEX,
            partitionKey: { name: 'timelineKey', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });
        this.messagesTable.addGlobalSecondaryIndex({
            indexName: MESSAGE_SENDER_INDEX,
            partitionKey: { name: 'senderKey', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });

        this.remindersTable = new dynamodb.Table(this, 'RemindersTable', {
            tableName: config.icloudBridge.remindersTableName,
            partitionKey: { name: 'listId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'reminderId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        this.remindersTable.addGlobalSecondaryIndex({
            indexName: REMINDER_DUE_INDEX,
            // Stringified `completed`, because index keys cannot be boolean.
            partitionKey: { name: 'completedKey', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'dueSort', type: dynamodb.AttributeType.STRING },
        });

        this.commandsTable = new dynamodb.Table(this, 'CommandsTable', {
            tableName: config.icloudBridge.commandsTableName,
            partitionKey: { name: 'commandId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            timeToLiveAttribute: 'ttl',
        });

        this.syncStateTable = new dynamodb.Table(this, 'SyncStateTable', {
            tableName: config.icloudBridge.syncStateTableName,
            // Named `stateKey` rather than the spec's `key`: KEY is a DynamoDB
            // reserved word, and this saves aliasing it in every expression.
            partitionKey: { name: 'stateKey', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // --- ingest bus + fan-out -------------------------------------------

        this.eventBus = new events.EventBus(this, 'IngestBus', {
            eventBusName: config.icloudBridge.eventBusName,
        });

        // Generic fan-out: every provider's read events land here, so future
        // subscribers (the planned WebSocket broadcaster, agent triggers) need no
        // per-domain wiring.
        this.ingestTopic = new sns.Topic(this, 'IngestTopic', {
            topicName: 'icloud-bridge-ingest',
            displayName: 'iCloud Bridge Ingest Events',
        });

        // --- command queue --------------------------------------------------

        const commandDlq = new DLQWithMonitor(this, 'IcloudBridgeCommand', {
            notificationEmail: config.base.infrastructureAlertEmail,
            topicDisplayName: 'iCloud Bridge Command Errors',
        });

        this.commandQueue = new sqs.Queue(this, 'CommandQueue', {
            queueName: config.icloudBridge.commandQueueName,
            // Long enough for the slowest local action (AppleScript send) to finish
            // and report back before SQS hands the command to another receive.
            visibilityTimeout: COMMAND_VISIBILITY_TIMEOUT,
            retentionPeriod: cdk.Duration.days(4),
            enforceSSL: true,
            deadLetterQueue: {
                queue: commandDlq.dlq,
                maxReceiveCount: COMMAND_MAX_RECEIVE_COUNT,
            },
        });

        // --- secrets --------------------------------------------------------

        // A JSON object of `name -> key` so a consumer can be added, or a key
        // rotated, by editing the secret without redeploying.
        this.apiKeySecret = new secretsmanager.Secret(this, 'ApiKeySecret', {
            secretName: config.icloudBridge.apiKeySecret,
            description: 'Consumer API keys for the iCloud bridge API',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({}),
                generateStringKey: 'default',
                // Keys travel in an Authorization header, so keep them token-safe.
                excludePunctuation: true,
                includeSpace: false,
                passwordLength: 48,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        this.blueBubblesPasswordSecret = new secretsmanager.Secret(this, 'BlueBubblesPasswordSecret', {
            secretName: config.icloudBridge.blueBubblesPasswordSecret,
            description: 'Server password for the local BlueBubbles instance on the Mac',
            generateSecretString: {
                excludePunctuation: true,
                includeSpace: false,
                passwordLength: 32,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // --- Mac agent identity ---------------------------------------------

        this.agentUser = new iam.User(this, 'AgentUser', {
            userName: 'icloud-bridge-agent',
        });
        const accessKey = new iam.AccessKey(this, 'AgentAccessKey', { user: this.agentUser });

        // Stored in Secrets Manager so the key can be pulled onto the Mac once and
        // moved into the login Keychain; it is never written to the repo.
        this.agentCredentialsSecret = new secretsmanager.Secret(this, 'AgentCredentialsSecret', {
            secretName: config.icloudBridge.agentCredentialsSecret,
            description: 'Access key for the iCloud bridge Mac agent',
            secretObjectValue: {
                // The key id is not sensitive; only the secret half needs protecting.
                accessKeyId: cdk.SecretValue.unsafePlainText(accessKey.accessKeyId),
                secretAccessKey: accessKey.secretAccessKey,
            },
        });

        this.grantAgentAccess();
        this.monitorAgentHeartbeat();
    }

    /**
     * The Mac is unreachable from AWS, so the only evidence the agent is alive is
     * the metric it publishes. Missing data is therefore treated as breaching: a
     * crashed agent, a sleeping Mac and a revoked credential all look the same
     * from here, and all of them warrant an email.
     */
    private monitorAgentHeartbeat() {
        const topic = new sns.Topic(this, 'HeartbeatAlarmTopic', {
            topicName: 'icloud-bridge-agent-heartbeat-alarm',
            displayName: 'iCloud Bridge Agent Heartbeat',
        });
        topic.addSubscription(new subscriptions.EmailSubscription(config.base.infrastructureAlertEmail));

        const alarm = new cloudwatch.Metric({
            namespace: config.icloudBridge.metricNamespace,
            metricName: 'AgentHeartbeat',
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
        }).createAlarm(this, 'AgentHeartbeatAlarm', {
            alarmName: 'IcloudBridgeAgentHeartbeatAlarm',
            alarmDescription: `No heartbeat from the iCloud bridge Mac agent for ${HEARTBEAT_ALARM_MINUTES} minutes`,
            threshold: 1,
            evaluationPeriods: HEARTBEAT_ALARM_MINUTES,
            datapointsToAlarm: HEARTBEAT_ALARM_MINUTES,
            comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        });
        alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
        // Also say when it comes back, so a transient outage closes itself out.
        alarm.addOkAction(new cloudwatchActions.SnsAction(topic));
    }

    /**
     * The Mac agent's least-privilege policy (spec section 9). It may drain the
     * command queue, publish read events, record command status and its own sync
     * checkpoints, and read the BlueBubbles password. Notably it cannot write to
     * the messages or reminders tables directly — those are only ever written by
     * the ingest Lambda, downstream of the bus.
     */
    private grantAgentAccess() {
        this.commandQueue.grantConsumeMessages(this.agentUser);
        this.eventBus.grantPutEventsTo(this.agentUser);
        this.blueBubblesPasswordSecret.grantRead(this.agentUser);

        this.agentUser.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [this.commandsTable.tableArn],
        }));
        this.agentUser.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
            resources: [this.syncStateTable.tableArn],
        }));

        // Heartbeat metric, so a stopped or wedged agent can raise an alarm.
        this.agentUser.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cloudwatch:PutMetricData'],
            resources: ['*'],
            conditions: {
                StringEquals: { 'cloudwatch:namespace': config.icloudBridge.metricNamespace },
            },
        }));
    }
}
