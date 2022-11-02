import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class HourlyMinutelyHeavyRainAlert implements Alert {

    interval = Duration.hours.of(1);
    alertTitle = "1 Hour Rain Alert";
    alertKey = "1-hour-heavy-rain-alert";

    private readonly rainThreshold = 0.2; // inches - this amount in 1 minute would be huge

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
                message += `${toReadablePacificDate(minutelyData.datetime, Format.TIME_ONLY)}: ${minutelyData.precipitation} in of rain\n`;
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

    async processAggregate(weatherData: AggregatedWeatherData) {

        // TODO do we even have this aggregate data? should just use hourly?

        return {
            hasAlert: false
        }
    }

}