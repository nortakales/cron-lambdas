import * as cdk from 'aws-cdk-lib';
import { AutoxReminderCron } from './crons/autox-reminder';
import { WeatherAlertCron } from './crons/weather-alert';
import { DeleteTimerConstruct } from './constructs/delete-timer-construct';
import { AdhocWeatherReportAPI } from './constructs/adhoc-weather-report-api';
import { NewComicsCron } from './crons/new-comics';
import { ErrorLogNotifier } from './constructs/error-log-notifier';
import { Construct } from 'constructs';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const errorLogNotifier = new ErrorLogNotifier(this, "ErrorLogNotifier", "Main");

        const weatherAlertCron = new WeatherAlertCron(this, "WeatherAlertCron", errorLogNotifier.lambda);
        new AutoxReminderCron(this, "AutoxReminderCron", errorLogNotifier.lambda);
        new NewComicsCron(this, "NewComicsCron", errorLogNotifier.lambda);

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct', errorLogNotifier.lambda);
        new AdhocWeatherReportAPI(this, 'AdhocWeatherAPI', weatherAlertCron.lambda);
    }
}
