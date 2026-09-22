import * as cdk from 'aws-cdk-lib';
import { AutoxReminderCron } from './crons/autox-reminder-construct';
import { WeatherAlertCron } from './crons/weather-alert-construct';
import { DeleteTimerConstruct } from './constructs/delete-timer-construct';
import { AdhocWeatherReportAPI } from './constructs/adhoc-weather-report-api';
import { NewComicsCron } from './crons/new-comics-construct';
import { ErrorLogNotifier } from './constructs/error-log-notifier';
import { Construct } from 'constructs';
import { ProductTrackerCron } from './crons/product-tracker-construct';
import { DynamoDBAccessAPI } from './constructs/dynamodb-access-api';
import { SwitchBotAPI } from './constructs/switchbot-api';
import { AlexaSkillLambda } from './constructs/alexa-skill-lambda';
import { S3Bucket } from 'aws-cdk-lib/aws-kinesisfirehose';
import { CronLambdasS3Buckets } from './constructs/s3-buckets';
import { IcloudBridge } from './constructs/icloud-bridge/icloud-bridge';
import { HttpCacheBucket } from './constructs/http-cache-bucket';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const errorLogNotifier = new ErrorLogNotifier(this, "ErrorLogNotifier", "Main");

        // Shared generic HTTP response cache, used via the `useCache` option in src/lambda/http.ts.
        // Passed into any cron/API construct whose lambda(s) make httpsGet calls, so useCache is
        // available to them; each construct grants itself access and sets the bucket name env var.
        const httpCacheBucket = new HttpCacheBucket(this, "HttpCacheBucket");

        const weatherAlertCron = new WeatherAlertCron(this, "WeatherAlertCron", errorLogNotifier.lambda, httpCacheBucket.bucket);
        new AutoxReminderCron(this, "AutoxReminderCron", errorLogNotifier.lambda, httpCacheBucket.bucket);
        new NewComicsCron(this, "NewComicsCron", errorLogNotifier.lambda, httpCacheBucket.bucket);
        new ProductTrackerCron(this, "ProductTrackerCron", errorLogNotifier.lambda, httpCacheBucket.bucket);

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct', errorLogNotifier.lambda);
        new AdhocWeatherReportAPI(this, 'AdhocWeatherAPI', weatherAlertCron.lambda);
        new DynamoDBAccessAPI(this, 'DynamoDBAccessAPI', errorLogNotifier.lambda);
        new SwitchBotAPI(this, 'SwitchBotAPI', errorLogNotifier.lambda, httpCacheBucket.bucket);
        new AlexaSkillLambda(this, 'AlexaSkillLambda', errorLogNotifier.lambda);

        new IcloudBridge(this, 'IcloudBridge', errorLogNotifier.lambda);

        new CronLambdasS3Buckets(this, 'CronLambdasS3Buckets');
    }
}
