import * as cdk from '@aws-cdk/core';
import { AutoxReminderCron } from './crons/autox-reminder';
import { WeatherAlertCron } from './crons/weather-alert';
import { DeleteTimerConstruct } from './constructs/delete-timer-construct';
import { AdhocWeatherReportAPI } from './constructs/adhoc-weather-report-api';
import { NewComicsCron } from './crons/new-comics';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        new AutoxReminderCron(this, "AutoxReminderCron");
        const weatherAlertCron = new WeatherAlertCron(this, "WeatherAlertCron");
        new NewComicsCron(this, "NewComicsCron");

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct');
        new AdhocWeatherReportAPI(this, 'AdhocWeatherAPI', weatherAlertCron.lambda);
    }
}
