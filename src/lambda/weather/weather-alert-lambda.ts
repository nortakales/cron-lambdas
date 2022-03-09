import { sendEmail } from '../emailer';
import { NotificationApplication, sendPushNotification, Sound } from '../notifier';
import { BiDaily48HourWindAlert } from './alerts/48-hour-wind-alert';
import { Daily7DayWindAlert } from './alerts/7-day-wind-alert';
import { Alert, NotificationType } from './interfaces/alert-types';
import { WeatherData } from "./data-sources/common/common-data";
import { toPacificIsoString } from './utilities';
import { Duration } from "typed-duration";
import * as DDB from '../dynamo';
import * as SM from '../secrets';
import { YearlyFirstFreezeAlert } from './alerts/yearly-first-freeze-alert';
import { Daily7DayExtremeTemperatureAlert } from './alerts/7-day-extreme-temperature-alert';
import { Daily7DayNationalWeatherAlert } from './alerts/7-day-national-weather-alert';
import { Daily7DaySnowAlert } from './alerts/7-day-snow-alert';
import { HourlyMinutelyHeavyRainAlert } from './alerts/1-hour-heavy-rain-alert';
import * as openweather from './data-sources/openweather/openweather-api';

const ENABLED = process.env.ENABLED!;
const TABLE_NAME = process.env.TABLE_NAME!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const REPORT_TYPE = process.env.REPORT_TYPE;

async function getLastTimestamp(alertKey: string) {
    return await DDB.get(TABLE_NAME, {
        alertKey: alertKey
    });
}

async function updateLastTimestamp(alertKey: string, lastTimestamp: string) {
    await DDB.put(TABLE_NAME, {
        alertKey: alertKey,
        lastTimestamp: lastTimestamp
    })
}

const allowableOffset = Duration.minutes.of(10);

async function shouldRunAlert(alert: Alert) {

    const currentTime = new Date();
    let runAlert = true;

    const item = await getLastTimestamp(alert.alertKey);

    if (item?.lastTimestamp) {
        const lastAlertTime = new Date(item.lastTimestamp);

        let timeComparison = Duration.milliseconds.from(alert.interval) - Duration.milliseconds.from(allowableOffset);

        console.log("Last alert time: " + lastAlertTime.getTime() + " / " + toPacificIsoString(lastAlertTime));
        console.log("Current time: " + currentTime.getTime() + " / " + toPacificIsoString(currentTime));

        if (currentTime.getTime() - lastAlertTime.getTime() < timeComparison) {
            console.log("Not enough time has passed to run " + alert.alertKey);
            runAlert = false;
        }
    } else {
        console.log("No timestamp for alert <" + alert.alertKey + ">");
    }

    return runAlert;
}

const alerts: Alert[] = [
    new Daily7DayExtremeTemperatureAlert(),
    new Daily7DayNationalWeatherAlert(),
    new Daily7DaySnowAlert(),
    new YearlyFirstFreezeAlert(),
    new HourlyMinutelyHeavyRainAlert(),
    new Daily7DayWindAlert(),
    new BiDaily48HourWindAlert(),
];

exports.handler = async (event: any = {}, context: any = {}) => {

    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    const adhoc = isAdhocReport(event);

    if (ENABLED !== 'true' && !adhoc) {
        console.log("Weather Alert is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }

    console.log(`Running as ${adhoc ? 'ADHOC' : 'REGULAR'} report...`);

    const weatherData: WeatherData = await openweather.getAsCommonData();

    if (adhoc) {
        const report = await processAdhocReport(weatherData);
        //console.log(report.body);
        return report;
    } else {
        return await processRegularReport(weatherData);
    }
};

async function processRegularReport(weatherData: WeatherData) {

    let hasAlerts = false;
    let hasEmailAlert = false;
    let hasPushAlert = false;
    let emailAlertBody = '';
    let pushAlertBody = '';

    for (let alert of alerts) {

        let runAlert = await shouldRunAlert(alert);
        if (!runAlert) {
            continue;
        }

        const alertData = await alert.process(weatherData);

        if (alertData.hasAlert) {
            hasAlerts = true;
            if (alertData.notificationType === NotificationType.EMAIL || alertData.notificationType === NotificationType.EMAIL_AND_PUSH) {
                hasEmailAlert = true;
                emailAlertBody += `${alert.alertTitle}\n\n${alertData.alertMessage}\n\n`;
            }
            if (alertData.notificationType === NotificationType.PUSH || alertData.notificationType === NotificationType.EMAIL_AND_PUSH) {
                hasPushAlert = true;
                pushAlertBody += `${alert.alertTitle}\n\n${alertData.alertMessage}\n\n`;
            }

            const currentTime = new Date();
            console.log("Updating timestamp for alert " + alert.alertKey + " to " + toPacificIsoString(currentTime));
            await updateLastTimestamp(alert.alertKey, toPacificIsoString(currentTime));
        }
    }

    if (!hasAlerts) {
        console.log("No alerts!");
        console.log("Complete");

        return {
            statusCode: 200,
            headers: {},
            body: "Success"
        };
    }

    if (hasEmailAlert) {
        await sendEmail({
            toAddresses: EMAIL_LIST.split(','),
            fromAddress: FROM,
            subject: SUBJECT,
            textBody: emailAlertBody
        });
    }

    if (hasPushAlert) {
        await sendPushNotification(NotificationApplication.WEATHER, "Weather Alert", pushAlertBody, Sound.PUSHOVER);
    }

    console.log("Complete");

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
}

async function processAdhocReport(weatherData: WeatherData) {

    let alertBody = '';

    for (let alert of alerts) {

        const alertData = await alert.process(weatherData);

        if (alertData.hasAlert) {
            alertBody += `${alert.alertTitle}\n\n${alertData.alertMessage}\n\n`;
        } else {
            alertBody += `${alert.alertTitle}\n\nNo alerts\n\n\n`;
        }
    }

    console.log("Complete");

    return {
        statusCode: 200,
        headers: {},
        body: alertBody
    };
}

function isAdhocReport(event: any) {
    if (REPORT_TYPE && REPORT_TYPE === 'adhoc') {
        return true;
    }
    if (event?.queryStringParameters?.type === 'adhoc') {
        return true;
    }
    return false;
}

// Uncomment this to call locally
// exports.handler();
