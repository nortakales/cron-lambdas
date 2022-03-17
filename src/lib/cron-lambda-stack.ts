import * as cdk from '@aws-cdk/core';
import { AutoxReminderCron } from './crons/autox-reminder';
import { WeatherAlertCron } from './crons/weather-alert';
import { DeleteTimerConstruct } from './constructs/delete-timer-construct';
import { AdhocWeatherReportAPI } from './constructs/adhoc-weather-report-api';
import { NewComicsCron } from './crons/new-comics';
import { ErrorLogNotifier } from './constructs/error-log-notifier';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const errorLogNotifier = new ErrorLogNotifier(this, "ErrorLogNotifier");

        const weatherAlertCron = new WeatherAlertCron(this, "WeatherAlertCron", errorLogNotifier.lambda);
        new AutoxReminderCron(this, "AutoxReminderCron");
        new NewComicsCron(this, "NewComicsCron");

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct');
        new AdhocWeatherReportAPI(this, 'AdhocWeatherAPI', weatherAlertCron.lambda);
    }
}
