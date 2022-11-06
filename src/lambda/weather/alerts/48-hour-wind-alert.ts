import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType, ReportType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, getDirectionFromDegrees, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

export class BiDaily48HourWindAlert implements Alert {

    interval = Duration.hours.of(6);
    alertTitle = "48 Hour Wind Alert";
    alertKey = "48-hour-wind-alert-quadaily";

    private readonly windSpeedThreshold = 15;
    private readonly windGustThreshold = 30;

    async process(weatherData: WeatherData, reportType: ReportType) {

        console.log("Running " + this.alertTitle);

        let hasAlert = false;
        let message = '';
        let date = null;

        for (let hourlyData of weatherData.hourly) {
            if (hourlyData.wind_speed > this.windSpeedThreshold || hourlyData.wind_gust > this.windGustThreshold) {
                hasAlert = true;
                const currentDate = toReadablePacificDate(hourlyData.datetime, Format.DATE_ONLY);
                if (date !== currentDate) {
                    if (date !== null) {
                        message += "\n";
                    }
                    date = currentDate;
                    message += date + "\n"
                }
                message += `${toReadablePacificDate(hourlyData.datetime, Format.TIME_ONLY)}: ${hourlyData.wind_speed} mph / ${hourlyData.wind_gust} mph / ${getDirectionFromDegrees(hourlyData.wind_deg)}\n`;
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
        let date = null;

        for (let hourlyData of weatherData.hourly) {


            const windSpeedData = hourlyData.wind_speed;
            const windGustData = hourlyData.wind_gust;
            const windDegreeData = hourlyData.wind_deg;

            if ((windSpeedData.average + windSpeedData.std) > this.windSpeedThreshold || (windGustData.average + windGustData.std) > this.windGustThreshold) {
                hasAlert = true;
                const currentDate = toReadablePacificDate(hourlyData.datetime, Format.DATE_ONLY);
                if (date !== currentDate) {
                    if (date !== null) {
                        message += "\n";
                    }
                    date = currentDate;
                    message += date + "\n"
                }
                message += `${toReadablePacificDate(hourlyData.datetime, Format.TIME_ONLY)}\n    ${windSpeedData.toString(reportType)} mph\n    ${windGustData.toString(reportType)} mph\n    ${windDegreeData.toString(reportType)} deg\n    ${getDirectionFromDegrees(windDegreeData.average)}\n`;
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