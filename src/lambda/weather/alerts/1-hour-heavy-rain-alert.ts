import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType, ReportType } from "../interfaces/alert-types";
import { WeatherData } from "../data-sources/common/common-data";
import { Format, round, toReadablePacificDate } from "../utilities";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";

interface RainRate {
    datetime: number; // seconds
    rate: number; // in/hr
}

export class HourlyMinutelyHeavyRainAlert implements Alert {

    interval = Duration.hours.of(1);
    alertTitle = "1 Hour Rain Alert";
    alertKey = "1-hour-heavy-rain-alert";

    // Minutely precipitation is a *rate* (OpenWeather reports mm/h, converted to in/hr), not an amount.
    // For reference, the AMS glossary calls 0.10-0.30 in/hr "moderate" and > 0.30 in/hr "heavy" rain.
    private readonly rainRateThreshold = 0.2; // in/hr

    async process(weatherData: WeatherData, reportType: ReportType) {
        console.log("Running " + this.alertTitle);

        if (!weatherData.minutely) {
            console.log("Minute data was missing");
            return {
                hasAlert: false
            }
        }

        return this.buildAlert(weatherData.minutely.map(minutely => ({
            datetime: minutely.datetime,
            rate: minutely.precipitation
        })));
    }

    async processAggregate(weatherData: AggregatedWeatherData, reportType: ReportType) {
        console.log("Running " + this.alertTitle);

        if (!weatherData.minutely || weatherData.minutely.length === 0) {
            console.log("Minute data was missing");
            return {
                hasAlert: false
            }
        }

        return this.buildAlert(weatherData.minutely
            .filter(minutely => minutely.precipitation.average != null)
            .map(minutely => ({
                datetime: minutely.datetime,
                rate: minutely.precipitation.average
            })));
    }

    // Groups consecutive minutes over the threshold into periods, so a 40 minute downpour is one line
    // instead of 40
    private buildAlert(rainRates: RainRate[]): AlertData {

        const periods: RainRate[][] = [];
        let currentPeriod: RainRate[] | null = null;

        for (let rainRate of rainRates) {
            if (rainRate.rate > this.rainRateThreshold) {
                if (currentPeriod == null) {
                    currentPeriod = [];
                    periods.push(currentPeriod);
                }
                currentPeriod.push(rainRate);
            } else {
                currentPeriod = null;
            }
        }

        if (periods.length === 0) {
            return {
                hasAlert: false
            }
        }

        let message = '';
        for (let period of periods) {
            const start = toReadablePacificDate(period[0].datetime, Format.TIME_ONLY);
            const end = toReadablePacificDate(period[period.length - 1].datetime, Format.TIME_ONLY);
            const peak = period.reduce((max, current) => current.rate > max.rate ? current : max);
            const peakTime = toReadablePacificDate(peak.datetime, Format.TIME_ONLY);
            const timeRange = start === end ? start : `${start} - ${end}`;
            message += `${timeRange}: peak ${round(peak.rate, 2)} in/hr at ${peakTime}\n`;
        }

        return {
            hasAlert: true,
            alertMessage: message,
            notificationType: NotificationType.EMAIL_AND_PUSH
        }
    }

}
