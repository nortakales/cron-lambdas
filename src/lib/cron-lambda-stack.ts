import * as cdk from '@aws-cdk/core';
import { AutoxReminderCron } from './crons/autox-reminder';
import { WeatherAlertCron } from './crons/weather-alert';
import { DeleteTimerConstruct } from './constructs/delete-timer-construct';

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        new AutoxReminderCron(this, "AutoxReminderCron");
        new WeatherAlertCron(this, "WeatherAlertCron");

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct');
    }
}
