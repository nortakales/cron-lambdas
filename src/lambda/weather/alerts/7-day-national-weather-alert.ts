import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

export class Daily7DayNationalWeatherAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "National Weather Alert";
    alertKey = "7-day-national-weather-alert-daily";

    async process(weatherData: WeatherData) {

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
${alertData.description}
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
}