import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const REGION = process.env.REGION!;

const client = new SecretsManagerClient({ region: REGION });

export async function getSecretString(secret: string) {

    const command = new GetSecretValueCommand({
        SecretId: secret
    });
    const response = await client.send(command);

    return response.SecretString;
}

export async function getSecretObject(secret: string) {
    const command = new GetSecretValueCommand({
        SecretId: secret
    });
    const response = await client.send(command);

    return JSON.parse(response.SecretString!);
}