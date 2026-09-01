import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as config from '../../../config/config.json';
import {
    IcloudBridgeCore,
    MESSAGE_SENDER_INDEX,
    MESSAGE_TIMELINE_INDEX,
    REMINDER_DUE_INDEX,
} from './bridge-core';
import { bridgeLambda } from './bridge-lambda';

/**
 * The only public surface of the bridge: an HTTP API fronting the read, write and
 * command-status Lambdas, with every route behind a Bearer-token authorizer.
 *
 * HTTP API rather than the REST API used elsewhere in this repo: it is markedly
 * cheaper per request and its Lambda authorizer speaks `Authorization: Bearer`
 * natively, where REST usage-plan keys would force an `x-api-key` header.
 */

/** Sized for a personal dashboard polling on a timer, not for public traffic. */
const THROTTLE_RATE_LIMIT = 20;
const THROTTLE_BURST_LIMIT = 40;

export class IcloudBridgeApi extends Construct {

    readonly httpApi: apigwv2.HttpApi;

    constructor(
        scope: Construct,
        id: string,
        core: IcloudBridgeCore,
        errorLogNotifierLambda: lambda.Function,
    ) {
        super(scope, id);

        const authorizerLambda = bridgeLambda(this, 'AuthorizerLambda', {
            source: 'authorizer',
            functionName: 'IcloudBridgeAuthorizerLambda',
            description: 'Validates consumer API keys for the iCloud bridge API',
            environment: {
                API_KEY_SECRET: core.apiKeySecret.secretName,
            },
            errorLogNotifierLambda,
            timeout: cdk.Duration.seconds(5),
            memorySize: 128,
        });
        core.apiKeySecret.grantRead(authorizerLambda);

        const readLambda = bridgeLambda(this, 'ApiReadLambda', {
            source: 'api-read',
            functionName: 'IcloudBridgeApiReadLambda',
            description: 'Serves iCloud bridge reads from the DynamoDB mirror',
            environment: {
                MESSAGES_TABLE_NAME: core.messagesTable.tableName,
                REMINDERS_TABLE_NAME: core.remindersTable.tableName,
                MESSAGE_TIMELINE_INDEX,
                MESSAGE_SENDER_INDEX,
                REMINDER_DUE_INDEX,
            },
            errorLogNotifierLambda,
        });
        core.messagesTable.grantReadData(readLambda);
        core.remindersTable.grantReadData(readLambda);

        const writeLambda = bridgeLambda(this, 'ApiWriteLambda', {
            source: 'api-write',
            functionName: 'IcloudBridgeApiWriteLambda',
            description: 'Records iCloud bridge writes and queues them for the Mac agent',
            environment: {
                COMMANDS_TABLE_NAME: core.commandsTable.tableName,
                COMMAND_QUEUE_URL: core.commandQueue.queueUrl,
                COMMAND_RETENTION_DAYS: config.icloudBridge.commandRetentionDays,
            },
            errorLogNotifierLambda,
        });
        core.commandsTable.grantWriteData(writeLambda);
        core.commandQueue.grantSendMessages(writeLambda);

        const statusLambda = bridgeLambda(this, 'CmdStatusLambda', {
            source: 'cmd-status',
            functionName: 'IcloudBridgeCmdStatusLambda',
            description: 'Reports execution status of queued iCloud bridge commands',
            environment: {
                COMMANDS_TABLE_NAME: core.commandsTable.tableName,
            },
            errorLogNotifierLambda,
            memorySize: 128,
        });
        core.commandsTable.grantReadData(statusLambda);

        // --- the API --------------------------------------------------------

        const authorizer = new authorizers.HttpLambdaAuthorizer('IcloudBridgeAuthorizer', authorizerLambda, {
            authorizerName: 'icloud-bridge-authorizer',
            responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
            identitySource: ['$request.header.Authorization'],
            // Caching keys the result on the header value, so repeat calls from the
            // dashboard's poll loop skip the authorizer entirely.
            resultsCacheTtl: cdk.Duration.minutes(5),
        });

        this.httpApi = new apigwv2.HttpApi(this, 'IcloudBridgeHttpApi', {
            apiName: 'icloud-bridge-api',
            description: 'Consumer API for Messages and Reminders bridged from the Mac',
            // Applied to every route, so a route added later is authenticated by
            // default rather than by remembering to opt in.
            defaultAuthorizer: authorizer,
        });

        const read = new integrations.HttpLambdaIntegration('ReadIntegration', readLambda);
        const write = new integrations.HttpLambdaIntegration('WriteIntegration', writeLambda);
        const status = new integrations.HttpLambdaIntegration('StatusIntegration', statusLambda);

        this.httpApi.addRoutes({ path: '/messages', methods: [apigwv2.HttpMethod.GET], integration: read });
        this.httpApi.addRoutes({ path: '/messages/{chatId}', methods: [apigwv2.HttpMethod.GET], integration: read });
        this.httpApi.addRoutes({ path: '/messages', methods: [apigwv2.HttpMethod.POST], integration: write });

        // Declared before `/reminders` only for readability; HTTP API routes are
        // exact matches, so the two never conflict.
        this.httpApi.addRoutes({ path: '/reminders/lists', methods: [apigwv2.HttpMethod.GET], integration: read });
        this.httpApi.addRoutes({ path: '/reminders', methods: [apigwv2.HttpMethod.GET], integration: read });
        this.httpApi.addRoutes({ path: '/reminders', methods: [apigwv2.HttpMethod.POST], integration: write });
        this.httpApi.addRoutes({ path: '/reminders/{reminderId}', methods: [apigwv2.HttpMethod.PATCH], integration: write });

        this.httpApi.addRoutes({ path: '/commands/{commandId}', methods: [apigwv2.HttpMethod.GET], integration: status });

        this.configureDefaultStage();

        new cdk.CfnOutput(this, 'IcloudBridgeApiUrl', {
            value: this.httpApi.apiEndpoint,
            description: 'Base URL of the iCloud bridge consumer API',
        });
    }

    /**
     * Throttling and access logs, applied through the L1 stage: the HttpStage L2 in
     * this CDK version exposes neither.
     */
    private configureDefaultStage() {
        const accessLogs = new logs.LogGroup(this, 'IcloudBridgeApiAccessLogs', {
            retention: logs.RetentionDays.ONE_YEAR,
        });
        // API Gateway writes access logs under its own principal, which needs an
        // explicit resource policy on the destination log group.
        accessLogs.grantWrite(new iam.ServicePrincipal('apigateway.amazonaws.com'));

        const stage = this.httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
        stage.defaultRouteSettings = {
            throttlingRateLimit: THROTTLE_RATE_LIMIT,
            throttlingBurstLimit: THROTTLE_BURST_LIMIT,
            detailedMetricsEnabled: true,
        };
        stage.accessLogSettings = {
            destinationArn: accessLogs.logGroupArn,
            // No Authorization header here: the authorizer's key name identifies the
            // caller without putting the key itself in a log.
            format: JSON.stringify({
                requestId: '$context.requestId',
                ip: '$context.identity.sourceIp',
                requestTime: '$context.requestTime',
                httpMethod: '$context.httpMethod',
                routeKey: '$context.routeKey',
                status: '$context.status',
                responseLength: '$context.responseLength',
                integrationLatency: '$context.integrationLatency',
                userAgent: '$context.identity.userAgent',
                keyName: '$context.authorizer.keyName',
            }),
        };
    }
}
