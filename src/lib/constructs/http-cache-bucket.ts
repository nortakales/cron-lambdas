import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Shared generic HTTP response cache used by src/lambda/http.ts (see the `useCache` request option).
 * Any lambda that calls httpsGet with `useCache: true` needs read/write access to this bucket plus the
 * HTTP_CACHE_BUCKET_NAME (and optionally HTTP_CACHE_TTL_MINUTES) environment variables set.
 *
 * Backed by S3 rather than DynamoDB: DynamoDB items are hard-capped at 400KB, which full rendered pages
 * (e.g. lego.com product pages, which run 700-900KB raw) can exceed even gzip-compressed. S3 has no
 * such practical limit.
 *
 * Entries are short-lived (see config.httpCache.ttlMinutes) and expiry is enforced by the application on
 * read via an `expiresat` object metadata field, since S3 has no per-object TTL. The lifecycle rule
 * below is just a storage-cost backstop for entries that are never re-read (S3 lifecycle expiration is
 * only day-granular, so it can't itself express a 30-minute TTL) - it does not need to line up with the
 * app-level TTL for correctness.
 */
export class HttpCacheBucket extends Construct {

    readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.bucket = new s3.Bucket(this, 'HttpCacheS3Bucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [{
                expiration: cdk.Duration.days(1)
            }]
        });
    }
}
