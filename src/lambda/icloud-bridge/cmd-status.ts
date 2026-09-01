import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ddb } from './shared/ddb';
import { startBridgeLog } from './shared/log';
import { badRequest, errorResponse, json, notFound } from './shared/http';
import { CommandRecord } from './shared/model';

/**
 * `GET /commands/{commandId}` — how a consumer finds out whether the write it
 * submitted actually happened on the Mac.
 */

const COMMANDS_TABLE = process.env.COMMANDS_TABLE_NAME!;

export const handler = async (
    event: APIGatewayProxyEventV2,
    context: any = {},
): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        startBridgeLog('icloud-bridge cmd-status', event, context);

        const commandId = event.pathParameters?.commandId;
        if (!commandId) throw badRequest('commandId path parameter is required');

        const result = await ddb.get({
            TableName: COMMANDS_TABLE,
            Key: { commandId },
        });
        if (!result.Item) {
            // Commands expire via TTL, so an old id is indistinguishable from a bad one.
            throw notFound(`No command found with id ${commandId}`);
        }

        const { ttl, ...command } = result.Item as CommandRecord & Record<string, any>;
        return json(200, command);
    } catch (e) {
        return errorResponse(e);
    }
};
