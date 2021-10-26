import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

export class Daily7DayWindAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "7 Day Wind Alert";
    alertKey = "7-day-wind-alert-daily";

    private readonly windSpeedThreshold = 12.5;
    private readonly windGustThreshold = 25;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.wind_speed > this.windSpeedThreshold || dailyData.wind_gust > this.windGustThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(dailyData.dt, Format.DATE_ONLY)}: ${dailyData.wind_speed} mph / ${dailyData.wind_gust} mph / ${getDirectionFromDegrees(dailyData.wind_deg)}\n`;
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