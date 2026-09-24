import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType, ReportType } from "../interfaces/alert-types";
import { AlertData as WeatherAlertData, WeatherData } from "../data-sources/common/common-data";
import { toReadablePacificDate } from "../utilities";
import { AggregatedAlertData, AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class Daily7DayNationalWeatherAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "National Weather Alert";
    alertKey = "7-day-national-weather-alert-daily";

    async process(weatherData: WeatherData, reportType: ReportType) {
        console.log("Running " + this.alertTitle);
        return this.buildAlert(weatherData.alerts || [], reportType);
    }

    async processAggregate(weatherData: AggregatedWeatherData, reportType: ReportType) {
        console.log("Running " + this.alertTitle);
        return this.buildAlert(weatherData.alerts || [], reportType);
    }

    private buildAlert(alerts: (WeatherAlertData | AggregatedAlertData)[], reportType: ReportType): AlertData {

        if (alerts.length === 0) {
            return {
                hasAlert: false
            }
        }

        let message = '';
        for (let alertData of alerts) {
            const dataSources = (alertData as AggregatedAlertData).dataSources;
            const sourcesLine = reportType?.dataSourceBreakout && dataSources ? `\nSources: ${dataSources.join(', ')}` : '';
            message += `
Sender: ${alertData.sender_name}
Event: ${alertData.event}
Duration: ${toReadablePacificDate(alertData.start * 1000)} to ${toReadablePacificDate(alertData.end * 1000)}
Tags: ${alertData.tags?.join(', ')}${sourcesLine}
Description:
${alertData.description?.substring(0, 200)}...
                `.trim() + "\n\n";
        }

        return {
            hasAlert: true,
            alertMessage: message,
            notificationType: NotificationType.EMAIL_AND_PUSH
        }
    }
}
