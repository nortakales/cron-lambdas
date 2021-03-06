import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, round, toReadablePacificDate } from "../utilities";

export class Daily7DaySnowAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "7 Day Snow Alert";
    alertKey = "7-day-snow-alert-daily";

    private readonly snowThreshold = 0;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.snow && round(dailyData.snow, 1) > this.snowThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}: snow is coming! ${round(dailyData.snow, 1)} inches\n`;
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