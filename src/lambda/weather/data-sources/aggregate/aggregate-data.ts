import { ReportType } from "../../interfaces/alert-types";

export interface AggregatedWeatherData {
    current: CurrentConditions;
    minutely: MinutelyConditions[];
    hourly: HourlyConditions[];
    daily: DailyConditions[];
}

export interface BaseConditions {
    // datetime epoch in seconds
    datetime: number;

    pressure?: AggregatedProperty;
    humidity?: AggregatedProperty;
    dew_point?: AggregatedProperty;
    uvi?: AggregatedProperty;
    clouds?: AggregatedProperty;

    wind_speed: AggregatedProperty;
    wind_deg: AggregatedProperty;
    wind_gust: AggregatedProperty;
}

export interface CurrentConditions extends BaseConditions {
    temp: AggregatedProperty;
    feels_like: AggregatedProperty;
    visibility: AggregatedProperty;
}

export interface MinutelyConditions {
    datetime: number;
    precipitation: AggregatedProperty;
}

export interface DailyConditions extends BaseConditions {

    temp: DailyTemperature;
    feels_like?: DailyFeelsLike;

    pop: AggregatedProperty;
    rain: AggregatedProperty;
    snow: AggregatedProperty;
}
export interface DailyFeelsLike {
    morn: AggregatedProperty;
    day: AggregatedProperty;
    eve: AggregatedProperty;
    night: AggregatedProperty;
}

export interface DailyTemperature {
    min: AggregatedProperty;
    max: AggregatedProperty;
    morn?: AggregatedProperty;
    day?: AggregatedProperty;
    eve?: AggregatedProperty;
    night?: AggregatedProperty;
}

export interface HourlyConditions extends BaseConditions {

    temp: AggregatedProperty;
    feels_like: AggregatedProperty;

    visibility: AggregatedProperty;

    pop: AggregatedProperty;
    rain: AggregatedProperty;
    snow: AggregatedProperty;
}

export class AggregatedProperty {

    // dataSourceName to value
    data: { [key: string]: number } = {};
    average: number;
    min: number;
    max: number;
    std: number;

    constructor(dataSource: string, value: number) {
        this.addDataPoint(dataSource, value);
    }

    addDataPoint(dataSource: string, value: number) {
        if (value == null) {
            return;
        }
        this.data[dataSource] = value;
        const values = Object.values(this.data);
        this.average = values.reduce((total, current) => total + current) / values.length;
        this.max = values.reduce((max, current) => max = (max == null || current > max ? current : max));
        this.min = values.reduce((min, current) => min = (min == null || current < min ? current : min));
        this.std = Math.sqrt(values.map(x => Math.pow(x - this.average, 2)).reduce((a, b) => a + b) / values.length)
    }

    toString(reportType: ReportType) {
        if (Object.keys(this.data).length <= 0) {
            return "No data";
        }
        let dataPoints = "";
        for (let point in this.data) {
            dataPoints += `${point} ${this.data[point].toFixed(2)}, `
        }
        dataPoints = dataPoints.replace(/, $/, '');

        let output = `${this.average.toFixed(2)} ± ${this.std.toFixed(2)}`;
        if (reportType?.dataSourceBreakout) {
            output += ` [${dataPoints}]`;
        }

        return output;
    }
}