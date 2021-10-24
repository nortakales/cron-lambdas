import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import { getDirectionFromDegrees, toReadablePacificDate } from "../utilities";

export class Daily7DayExtremeTemperatureAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "7 Day Extreme Temperature Alert";
    alertKey = "daily-7-day-extreme-temperature-alert";

    private readonly highTemp = 85;
    private readonly lowTemp = 25;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.temp.max > this.highTemp || dailyData.temp.min < this.lowTemp) {
                hasAlert = true;

                let tempText = "high of " + dailyData.temp.max + "°F";
                if (dailyData.temp.min < this.lowTemp) {
                    tempText = "low of " + dailyData.temp.min + "°F";
                }

                message += `${toReadablePacificDate(dailyData.dt)}: ${tempText}\n`;
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