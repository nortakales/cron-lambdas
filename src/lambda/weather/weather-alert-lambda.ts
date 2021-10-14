import { sendEmail } from '../emailer';
import { NotificationApplication, sendPushNotification } from '../notifier';
import { BiDaily48HourWindAlert } from './alerts/bidaily-48-hour-wind-alert';
import { Daily7DayWindAlert } from './alerts/daily-7-day-wind-alert';
import { Alert, NotificationType } from './interfaces/alert-types';
import { WeatherData } from './interfaces/data';
import { httpsGet } from '../http';
import { toIsoString } from './utilities';
import { Duration } from "typed-duration";
import * as DDB from '../dynamo';
import { YearlyFirstFreezeAlert } from './alerts/yearly-first-freeze-alert';

const API_KEY = process.env.API_KEY!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;
const ENABLED = process.env.ENABLED!;
const TABLE_NAME = process.env.TABLE_NAME!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;


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

        console.log("Last alert time: " + lastAlertTime.getTime() + " / " + toIsoString(lastAlertTime));
        console.log("Current time: " + currentTime.getTime() + " / " + toIsoString(currentTime));

        if (currentTime.getTime() - lastAlertTime.getTime() < timeComparison) {
            console.log("Not enough time has passed to run " + alert.alertKey);
            runAlert = false;
        }
    } else {
        console.log("No timestamp for alert <" + alert.alertKey + ">");
    }

    if (runAlert) {
        console.log("Updating timestamp for alert " + alert.alertKey + " to " + toIsoString(currentTime));
        await updateLastTimestamp(alert.alertKey, toIsoString(currentTime));
    }

    return runAlert;
}

const alerts: Alert[] = [
    new Daily7DayWindAlert(),
    new BiDaily48HourWindAlert(),
    new YearlyFirstFreezeAlert()
];

exports.handler = async (event = {}) => {
    if (ENABLED !== 'true') {
        console.log("Weather Alert is not enabled, exiting...");
        return;
    }

    console.log("Running...");

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${API_KEY}&lang=en&units=imperial`;

    const data = await httpsGet(url);
    const weatherData: WeatherData = JSON.parse(data);
    //console.log(JSON.stringify(weatherData, null, 2));

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
        }
    }

    if (!hasAlerts) {
        console.log("No alerts!");
        console.log("Complete");
        return;
    }

    if (hasEmailAlert) {
        await sendEmail({
            toAddresses: EMAIL_LIST.split(','),
            fromAddress: FROM,
            subject: SUBJECT,
            body: emailAlertBody
        });
    }

    if (hasPushAlert) {
        await sendPushNotification(NotificationApplication.WEATHER, "Weather Alert", pushAlertBody);
    }

    console.log("Complete");
};

// Uncomment this to call locally
// exports.handler();