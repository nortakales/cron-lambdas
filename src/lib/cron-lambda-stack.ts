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

export class CronLambdaStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const errorLogNotifier = new ErrorLogNotifier(this, "ErrorLogNotifier", "Main");

        const weatherAlertCron = new WeatherAlertCron(this, "WeatherAlertCron", errorLogNotifier.lambda);
        new AutoxReminderCron(this, "AutoxReminderCron", errorLogNotifier.lambda);
        new NewComicsCron(this, "NewComicsCron", errorLogNotifier.lambda);
        new ProductTrackerCron(this, "ProductTrackerCron", errorLogNotifier.lambda);

        new DeleteTimerConstruct(this, 'DeleteTimerConstruct', errorLogNotifier.lambda);
        new AdhocWeatherReportAPI(this, 'AdhocWeatherAPI', weatherAlertCron.lambda);
        new DynamoDBAccessAPI(this, 'DynamoDBAccessAPI', errorLogNotifier.lambda);
        new SwitchBotAPI(this, 'SwitchBotAPI', errorLogNotifier.lambda);
        //new AlexaSkillLambda(this, 'AlexaSkillLambda', errorLogNotifier.lambda);
    }
}
