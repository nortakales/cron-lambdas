import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as config from '../../config/config.json';

/**
 * Shared generic HTTP response cache used by src/lambda/http.ts (see the `useCache` request option).
 * Any lambda that calls httpsGet with `useCache: true` needs read/write access to this table plus the
 * HTTP_CACHE_TABLE_NAME (and optionally HTTP_CACHE_TTL_MINUTES) environment variables set.
 *
 * Entries are short-lived (see config.httpCache.ttlMinutes) and keyed by the requested URL. This is a
 * cache, not a source of truth, so it's safe to destroy/recreate.
 */
export class HttpCacheTable extends Construct {

    readonly table: dynamodb.Table;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.table = new dynamodb.Table(this, 'HttpCacheDynamoTable', {
            partitionKey: {
                name: 'url',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'expiresAt',
            tableName: config.httpCache.dynamoTableName
        });
    }
}
