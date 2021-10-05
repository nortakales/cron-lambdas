import { Alert, AlertData, AlertFrequency, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { getDirectionFromDegrees } from "../utilities";

export class Daily7DayWindAlert implements Alert {

    frequency = AlertFrequency.DAILY;
    alertTitle = "7 Day Wind Alert";
    alertKey = "daily-7-day-wind-alert";

    process(weatherData: WeatherData): AlertData {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.wind_speed > 25 || dailyData.wind_gust > 25) {
                hasAlert = true;
                message += new Date(dailyData.dt * 1000).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) +
                    `: wind speed of ${dailyData.wind_speed} mph and wind gust of ${dailyData.wind_gust} mph blowing ${getDirectionFromDegrees(dailyData.wind_deg)}\n`;
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
            notificationType: NotificationType.EMAIL
        }
    }

}