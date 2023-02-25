import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType, ReportType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class Daily7DayExtremeTemperatureAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "7 Day Extreme Temperature Alert";
    alertKey = "7-day-extreme-temperature-alert-daily";

    private readonly highTemp = 85;
    private readonly lowTemp = 25;

    async process(weatherData: WeatherData, reportType: ReportType) {

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

                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}: ${tempText}\n`;
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

    async processAggregate(weatherData: AggregatedWeatherData, reportType: ReportType) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {

            const maxData = dailyData.temp.max;
            const minData = dailyData.temp.min;

            if ((maxData.average + maxData.std) > this.highTemp || (minData.average - minData.std) < this.lowTemp) {
                hasAlert = true;

                let tempText = "high of " + maxData.toString(reportType) + " °F";
                if ((minData.average - minData.std) < this.lowTemp) {
                    tempText = "low of " + minData.toString(reportType) + " °F";
                }

                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}: ${tempText}\n`;
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