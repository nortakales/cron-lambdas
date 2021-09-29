import * as cdk from '@aws-cdk/core';
import { AutoxReminderCron } from './crons/autox-reminder';
import { WeatherAlertCron } from './crons/weather-alert';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        new AutoxReminderCron(this, "AutoxReminderCron");
        new WeatherAlertCron(this, "WeatherAlertCron");
    }
}
