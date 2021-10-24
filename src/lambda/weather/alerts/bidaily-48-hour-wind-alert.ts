import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

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
        let date = null;

        for (let hourlyData of weatherData.hourly) {
            if (hourlyData.wind_speed > this.windSpeedThreshold || hourlyData.wind_gust > this.windGustThreshold) {
                hasAlert = true;
                const currentDate = toReadablePacificDate(hourlyData.dt, Format.DATE_ONLY);
                if (date !== currentDate) {
                    if (date !== null) {
                        message += "\n";
                    }
                    date = currentDate;
                    message += date + "\n"
                }
                message += `${toReadablePacificDate(hourlyData.dt, Format.TIME_ONLY)}: ${hourlyData.wind_speed} mph / ${hourlyData.wind_gust} mph / ${getDirectionFromDegrees(hourlyData.wind_deg)}\n`;
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