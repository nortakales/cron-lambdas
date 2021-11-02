import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const REGION = process.env.REGION!;

const client = new SecretsManagerClient({ region: REGION });

export async function getSecret(secret: string) {

    const command = new GetSecretValueCommand({
        SecretId: secret
    });
    const response = await client.send(command);

    return response.SecretString;
}