import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import type { AgentConfig } from './config';
import { readAwsCredentials, type AwsCredentials } from './keychain';
import { logger } from './logger';

const log = logger('aws');

/**
 * The agent's AWS clients, all sharing one set of Keychain-sourced credentials.
 *
 * Every call the agent makes is outbound and SigV4-signed; nothing accepts an
 * inbound connection from AWS.
 */
export class AwsClients {

    readonly events: EventBridgeClient;
    readonly sqs: SQSClient;
    readonly ddb: DynamoDBDocument;
    readonly cloudwatch: CloudWatchClient;
    readonly secrets: SecretsManagerClient;

    private constructor(config: AgentConfig, credentials: AwsCredentials) {
        const shared = { region: config.region, credentials };

        this.events = new EventBridgeClient(shared);
        this.sqs = new SQSClient(shared);
        this.cloudwatch = new CloudWatchClient(shared);
        this.secrets = new SecretsManagerClient(shared);
        this.ddb = DynamoDBDocument.from(new DynamoDB(shared), {
            marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
            unmarshallOptions: { wrapNumbers: false },
        });
    }

    static async create(config: AgentConfig): Promise<AwsClients> {
        const credentials = await readAwsCredentials(config.keychainService);
        log.info(`Loaded agent credentials ${credentials.accessKeyId} from Keychain '${config.keychainService}'`);
        return new AwsClients(config, credentials);
    }

    async getSecretString(secretId: string): Promise<string> {
        const response = await this.secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
        if (!response.SecretString) {
            throw new Error(`Secret ${secretId} has no string value`);
        }
        return response.SecretString;
    }
}
