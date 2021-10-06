import { Alert, AlertData, AlertFrequency, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { getDirectionFromDegrees } from "../utilities";

export class BiDaily48HourWindAlert implements Alert {

    frequency = AlertFrequency.BIDAILY;
    alertTitle = "48 Hour Wind Alert";
    alertKey = "bidaily-48-hour-wind-alert";

    process(weatherData: WeatherData): AlertData {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let hourlyData of weatherData.hourly) {
            if (hourlyData.wind_speed > 25 || hourlyData.wind_gust > 25) {
                hasAlert = true;
                message += new Date(hourlyData.dt * 1000).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) +
                    `: wind speed of ${hourlyData.wind_speed} mph and wind gust of ${hourlyData.wind_gust} mph blowing ${getDirectionFromDegrees(hourlyData.wind_deg)}\n`;
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