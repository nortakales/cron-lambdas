import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class Daily7DayWindAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "7 Day Wind Alert";
    alertKey = "7-day-wind-alert-daily";

    private readonly windSpeedThreshold = 15;
    private readonly windGustThreshold = 30;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.wind_speed > this.windSpeedThreshold || dailyData.wind_gust > this.windGustThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}: ${dailyData.wind_speed} mph / ${dailyData.wind_gust} mph / ${getDirectionFromDegrees(dailyData.wind_deg)}\n`;
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

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {

            const windSpeedData = dailyData.wind_speed;
            const windGustData = dailyData.wind_gust;
            const windDegreeData = dailyData.wind_deg;

            if ((windSpeedData.average + windSpeedData.std) > this.windSpeedThreshold || (windGustData.average + windGustData.std) > this.windGustThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}\n    ${windSpeedData.toString()} mph\n    ${windGustData.toString()} mph\n    ${windDegreeData.toString()} deg\n    ${getDirectionFromDegrees(windDegreeData.average)}\n`;
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