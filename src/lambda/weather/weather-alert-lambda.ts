import { sendEmail } from '../emailer';
import { NotificationApplication, sendPushNotification, Sound } from '../notifier';
import { BiDaily48HourWindAlert } from './alerts/48-hour-wind-alert';
import { Daily7DayWindAlert } from './alerts/7-day-wind-alert';
import { Alert, AlertData, NotificationType, ReportType } from './interfaces/alert-types';
import { WeatherData } from "./data-sources/common/common-data";
import { Duration } from "typed-duration";
import * as DDB from '../dynamo';
import { YearlyFirstFreezeAlert } from './alerts/yearly-first-freeze-alert';
import { Daily7DayExtremeTemperatureAlert } from './alerts/7-day-extreme-temperature-alert';
import { Daily7DayNationalWeatherAlert } from './alerts/7-day-national-weather-alert';
import { Daily7DaySnowAlert } from './alerts/7-day-snow-alert';
import { HourlyMinutelyHeavyRainAlert } from './alerts/1-hour-heavy-rain-alert';
import * as openweather from './data-sources/openweather/openweather-api';
import { startLambdaLog } from '../utilities/logging';
import { Format, toReadablePacificDate } from './utilities';
import { getAggregatedData } from './data-sources/aggregate/aggregate';
import { AggregatedWeatherData } from './data-sources/aggregate/aggregate-data';

const ENABLED = process.env.ENABLED!;
const TABLE_NAME = process.env.TABLE_NAME!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const REPORT_TYPE = process.env.REPORT_TYPE;

const DEFAULT_REPORT_TYPE = ReportType.REGULAR_AGGREGATE;

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

    const currentTime = Date.now();
    let runAlert = true;

    const item = await getLastTimestamp(alert.alertKey);

    if (item?.lastTimestamp) {
        const lastAlertTime = new Date(item.lastTimestamp).getTime(); // TODO could update to moment

        let timeComparison = Duration.milliseconds.from(alert.interval) - Duration.milliseconds.from(allowableOffset);

        console.log("Last alert time: " + lastAlertTime + " / " + toReadablePacificDate(lastAlertTime, Format.ISO_8601));
        console.log("Current time: " + currentTime + " / " + toReadablePacificDate(currentTime, Format.ISO_8601));

        if (currentTime - lastAlertTime < timeComparison) {
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
    startLambdaLog(event, context, process.env);

    const reportType = getReportType(event);

    if (ENABLED !== 'true' && !reportType.isAdhoc) {
        console.log("Weather Alert is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }

    console.log(`Running as ${reportType.name} report...`);

    switch (reportType) {
        case ReportType.ADHOC:
            return await processAdhocReport(await openweather.getAsCommonData(), reportType);
        case ReportType.ADHOC_AGGREGATE:
        case ReportType.ADHOC_AGGREGATE_BREAKOUT:
            return await processAdhocAggregateReport(reportType);
        case ReportType.REGULAR:
        case ReportType.REGULAR_AGGREGATE:
            return await processRegularReport(reportType);
        default:
            return {
                statusCode: 400,
                headers: {},
                body: "Unknown ReportType: " + reportType
            };
    }
};

async function processRegularReport(reportType: ReportType) {

    let hasAlerts = false;
    let hasEmailAlert = false;
    let hasPushAlert = false;
    let emailAlertBody = '';
    let pushAlertBody = '';

    let weatherData;
    if (reportType.isAggregate) {
        weatherData = await getAggregatedData();
    } else {
        weatherData = await openweather.getAsCommonData();
    }

    for (let alert of alerts) {

        let runAlert = await shouldRunAlert(alert);
        if (!runAlert) {
            continue;
        }

        let alertData: AlertData;

        if (reportType.isAggregate) {
            alertData = await alert.processAggregate(weatherData as AggregatedWeatherData, reportType);
        } else {
            alertData = await alert.process(weatherData as WeatherData, reportType);
        }

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

            const currentTime = Date.now();
            console.log("Updating timestamp for alert " + alert.alertKey + " to " + toReadablePacificDate(currentTime, Format.ISO_8601));
            await updateLastTimestamp(alert.alertKey, toReadablePacificDate(currentTime, Format.ISO_8601));
        }
    }

    if (reportType.isAggregate && (weatherData as AggregatedWeatherData).skippedDataSources.length > 0) {
        hasAlerts = true;
        let skippedSourcesMessage = 'Skipped Data Sources\n\n';
        for (let skippedSource of (weatherData as AggregatedWeatherData).skippedDataSources) {
            skippedSourcesMessage += `${skippedSource.dataSourceName}: ${skippedSource.reason}\n\n`
        }
        emailAlertBody += skippedSourcesMessage;
        pushAlertBody += skippedSourcesMessage;
        // TODO maybe send a special notification if we are skipping a source too often?
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

async function processAdhocReport(weatherData: WeatherData, reportType: ReportType) {

    let alertBody = '';

    for (let alert of alerts) {

        const alertData = await alert.process(weatherData, reportType);

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

async function processAdhocAggregateReport(reportType: ReportType) {

    const data = await getAggregatedData();

    let alertBody = '';

    for (let alert of alerts) {

        const alertData = await alert.processAggregate(data, reportType);

        if (alertData.hasAlert) {
            alertBody += `${alert.alertTitle}\n\n${alertData.alertMessage}\n\n`;
        } else {
            alertBody += `${alert.alertTitle}\n\nNo alerts\n\n\n`;
        }
    }

    if (data.skippedDataSources.length > 0) {
        alertBody += 'Skipped Data Sources\n\n';
        for (let skippedSource of data.skippedDataSources) {
            alertBody += `${skippedSource.dataSourceName}: ${skippedSource.reason}\n\n`
        }
    }

    console.log("Complete");

    return {
        statusCode: 200,
        headers: {},
        body: alertBody
    };
}

function getReportType(event: any): ReportType {
    const stringToParse = event?.queryStringParameters?.type || REPORT_TYPE;
    // TODO refactor this
    if (stringToParse === 'adhoc') return ReportType.ADHOC;
    if (stringToParse === 'adhocAggregate') return ReportType.ADHOC_AGGREGATE;
    if (stringToParse === 'adhocAggregateBreakout') return ReportType.ADHOC_AGGREGATE_BREAKOUT;
    return DEFAULT_REPORT_TYPE;
}

// Uncomment this to call locally
exports.handler();
