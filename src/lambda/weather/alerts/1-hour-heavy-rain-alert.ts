import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

export class HourlyMinutelyHeavyRainAlert implements Alert {

    interval = Duration.hours.of(1);
    alertTitle = "1 Hour Rain Alert";
    alertKey = "1-hour-heavy-rain-alert";

    private readonly rainThreshold = 4; // mm

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        if (!weatherData.minutely) {
            console.log("Minute data was missing");
            return {
                hasAlert: false
            }
        }

        for (let minutelyData of weatherData.minutely) {
            if (minutelyData.precipitation > this.rainThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(minutelyData.datetime, Format.TIME_ONLY)}: ${minutelyData.precipitation} mm of rain\n`;
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