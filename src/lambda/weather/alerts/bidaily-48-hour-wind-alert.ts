import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

export class BiDaily48HourWindAlert implements Alert {

    interval = Duration.hours.of(12);
    alertTitle = "48 Hour Wind Alert";
    alertKey = "bidaily-48-hour-wind-alert";

    private readonly windSpeedThreshold = 25;
    private readonly windGustThreshold = 25;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let hourlyData of weatherData.hourly) {
            if (hourlyData.wind_speed > this.windSpeedThreshold || hourlyData.wind_gust > this.windGustThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(hourlyData.dt)}: wind speed of ${hourlyData.wind_speed} mph and wind gust of ${hourlyData.wind_gust} mph blowing ${getDirectionFromDegrees(hourlyData.wind_deg)}\n`;
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