import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

export class CronLambdasS3Buckets extends Construct {
    public readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.bucket = new s3.Bucket(this, 'CronLambdasPublicBucket', {
            bucketName: 'cron-lambdas-public-bucket',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            publicReadAccess: true,
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
                blockPublicAcls: false,
                ignorePublicAcls: false,
            }),

        });

        const assetsPath = path.join(__dirname, '../../../s3-assets');

        new s3deploy.BucketDeployment(this, 'UploadS3Assets', {
            sources: [s3deploy.Source.asset(assetsPath)],
            destinationBucket: this.bucket,
        });
    }
}
