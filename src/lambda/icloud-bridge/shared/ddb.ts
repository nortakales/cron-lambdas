import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

/**
 * A DocumentClient for the bridge's own tables.
 *
 * The repo-wide `src/lambda/dynamo.ts` exposes a fixed set of helpers (get/put/
 * query/scan/delete) with no support for conditional writes, pagination cursors
 * or batching — all of which the bridge needs. Rather than change a module four
 * other Lambdas depend on, the bridge owns its client here.
 */

const REGION = process.env.REGION!;

export const ddb = DynamoDBDocument.from(new DynamoDB({ region: REGION }), {
    marshallOptions: {
        convertEmptyValues: false,
        // Optional fields (notes, dueDate, sender...) are simply absent rather
        // than stored as null, which keeps sparse-GSI behaviour predictable.
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
    },
    unmarshallOptions: { wrapNumbers: false },
});

/** Raised by a conditional write that lost to a newer version of the same item. */
export function isConditionalCheckFailure(e: unknown): boolean {
    return (e as { name?: string })?.name === 'ConditionalCheckFailedException';
}
