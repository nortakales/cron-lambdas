import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType, ReportType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { getDirectionFromDegrees, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class Daily7DayNationalWeatherAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "National Weather Alert";
    alertKey = "7-day-national-weather-alert-daily";

    async process(weatherData: WeatherData, reportType: ReportType) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        if (weatherData.alerts) {
            for (let alertData of weatherData.alerts) {
                hasAlert = true;
                message += `
Sender: ${alertData.sender_name}
Event: ${alertData.event}
Duration: ${toReadablePacificDate(alertData.start * 1000)} to ${toReadablePacificDate(alertData.end * 1000)}
Tags: ${alertData.tags?.join(', ')}
Description:
${alertData.description?.substring(0, 200)}...
                `.trim() + "\n\n";
            }
        }

        if (!hasAlert) {
            return {
                hasAlert: false
            }
        }

        return {
            hasAlert: true,
            alertMessage: message,
            notificationType: NotificationType.EMAIL_AND_PUSH
        }
    }

    async processAggregate(weatherData: AggregatedWeatherData, reportType: ReportType) {

        // TODO look at weather alert data from all sources

        return {
            hasAlert: false
        }
    }
}