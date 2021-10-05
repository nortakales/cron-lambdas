import { sendEmail } from '../emailer';
import { sendPushNotification } from '../notifier';
import { BiDaily48HourWindAlert } from './alerts/bidaily-48-hour-wind-alert';
import { Daily7DayWindAlert } from './alerts/daily-7-day-wind-alert';
import { Alert, AlertFrequency, NotificationType } from './interfaces/alert-types';
import { WeatherData } from './interfaces/data';
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { httpsGet } from '../http';

const API_KEY = process.env.API_KEY!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;
const ENABLED = process.env.ENABLED!;
const REGION = process.env.REGION!;
const TABLE_NAME = process.env.TABLE_NAME!;

const DDB = DynamoDBDocument.from(new DynamoDB({ region: REGION }));

async function getLastTimestamp(alertKey: string) {

    const item = await DDB.get({
        TableName: TABLE_NAME,
        Key: {
            alertKey: alertKey
        }
    });

    if (item.Item !== undefined) {
        console.log("Found in DDB: " + item.Item.alertKey + " " + item.Item.lastTimestamp);
    }

    return item.Item;
}

async function updateLastTimestamp(alertKey: string, lastTimestamp: string) {

    console.log("Writing to DDB: " + alertKey + " " + lastTimestamp);

    await DDB.put({
        TableName: TABLE_NAME,
        Item: {
            alertKey: alertKey,
            lastTimestamp: lastTimestamp
        }
    });
}

const isoOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'full',
    timeStyle: 'full',
    timeZoneName: 'short'
}

const allowableOffset = 600 * 1000; // 10 minutes

async function shouldRunAlert(alert: Alert) {

    const currentTime = new Date();
    const currentTimeIso = currentTime.toLocaleString('en-US', isoOptions);
    let runAlert = true;

    const item = await getLastTimestamp(alert.alertKey);

    if (item?.lastTimestamp) {
        const lastAlertTime = new Date(item.lastTimestamp);
        console.log("Comparing " + lastAlertTime.toLocaleString('en-US', isoOptions), + " and " + currentTimeIso);

        let timeComparison = 3600 * 1000; // Smallest value, 1 hour in millis

        if (alert.frequency === AlertFrequency.DAILY) {
            timeComparison = 86400 * 1000; // 1 day in millis
        }
        if (alert.frequency === AlertFrequency.BIDAILY) {
            timeComparison = 86400 / 2 * 1000; // 12 hours in millis
        }

        timeComparison -= allowableOffset;

        if (currentTime.getTime() - lastAlertTime.getTime() < timeComparison) {
            console.log("Not enough time has passed to run " + alert.alertKey);
            runAlert = false;
        }
    } else {
        console.log("No timestamp for alert <" + alert.alertKey + ">");
    }

    console.log("Updating timestamp for alert <" + alert.alertKey + ">, at " + currentTimeIso);
    updateLastTimestamp(alert.alertKey, currentTimeIso);

    return runAlert;
}

const alerts: Alert[] = [
    new Daily7DayWindAlert(),
    new BiDaily48HourWindAlert()
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

    let hasAlerts = false;
    let hasEmailAlert = false;
    let hasPushAlert = false;
    let emailAlertBody = '';
    let pushAlertBody = '';

    for (let alert of alerts) {

        if (!shouldRunAlert(alert)) {
            continue;
        }

        const alertData = alert.process(weatherData);
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
        await sendEmail(emailAlertBody);
    }

    if (hasPushAlert) {
        await sendPushNotification("Weather Alert", pushAlertBody);
    }

    console.log("Complete");
};



// Uncomment this to call locally
exports.handler();