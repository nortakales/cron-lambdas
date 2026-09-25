import * as DDB from '../../dynamo';
import { Format, toReadablePacificDate } from '../utilities';
import { AggregatedProperty, AggregatedWeatherData, DailyConditions, HourlyConditions } from '../data-sources/aggregate/aggregate-data';
import moment from 'moment-timezone';
import { AggregatedCondition, Condition } from '../conditions/conditions';

// Stores the aggregated hourly/daily data from every scheduled run in DynamoDB, so it can be served by the weather
// data API and kept as history. See docs/weather-alert-system.md "Forecast history & API".
//
// Table: partition key `series` ("hourly" | "daily"), sort key `epoch` (seconds; the hour's start, or local midnight).
//
// Each run replaces the whole item for every hour/day that hasn't started yet, so the roll-up and per-source values in
// an item always come from the same run. Once an hour or day has started it's never written again, so it keeps the
// last forecast made before it started. Days freeze at their start (local midnight) rather than their end, because
// some sources only cover the remaining hours of today, which would make late-day values (and history) misleading.

const FORECAST_HISTORY_TABLE_NAME = process.env.FORECAST_HISTORY_TABLE_NAME!;

export type Series = 'hourly' | 'daily';

export interface StoredMetric {
    avg: number;
    min: number;
    max: number;
    std: number;
    n: number; // number of sources with a value
    sources: { [shortCode: string]: number };
}

// Weather condition (icon) from a two-step vote across the sources that provide one, see conditions.ts
export interface StoredCondition {
    value: Condition;
    isDay?: boolean; // hourly only: majority of sources that report day/night. Daily conditions are daytime conditions
    agreement: number; // share of voting sources whose condition equals value (0 to 1)
    n: number; // number of sources that voted
    votes: { [condition: string]: number };
    sources: { [shortCode: string]: Condition };
}

export interface StoredForecast {
    series: Series;
    epoch: number; // seconds
    time: string; // ISO 8601 in America/Los_Angeles, e.g. 2026-09-25T10:00:00-07:00
    date: string; // YYYY-MM-DD in America/Los_Angeles
    updatedAt: string; // ISO 8601, when the run that wrote this item happened
    sources: string[]; // shortCodes of the sources that contributed any metric
    skippedSources: string[]; // full names of sources that failed during the run that wrote this item
    metrics: { [metric: string]: StoredMetric };
    condition?: StoredCondition;
}

// Only the metrics that are actually aggregated across sources. pressure/humidity/dew_point/uvi/clouds are only taken
// from the first source for each timestamp (see aggregate.ts), so they're intentionally not stored.
const HOURLY_METRICS: { [name: string]: (hour: HourlyConditions) => AggregatedProperty } = {
    temp: hour => hour.temp,
    feels_like: hour => hour.feels_like,
    visibility: hour => hour.visibility,
    pop: hour => hour.pop,
    rain: hour => hour.rain,
    snow: hour => hour.snow,
    wind_speed: hour => hour.wind_speed,
    wind_deg: hour => hour.wind_deg,
    wind_gust: hour => hour.wind_gust
};

const DAILY_METRICS: { [name: string]: (day: DailyConditions) => AggregatedProperty } = {
    temp_max: day => day.temp.max,
    temp_min: day => day.temp.min,
    pop: day => day.pop,
    rain: day => day.rain,
    snow: day => day.snow,
    wind_speed: day => day.wind_speed,
    wind_deg: day => day.wind_deg,
    wind_gust: day => day.wind_gust
};

function toStoredMetric(property: AggregatedProperty | undefined): StoredMetric | undefined {
    if (property == null || Object.keys(property.data).length === 0) {
        return undefined;
    }
    return {
        avg: property.average,
        min: property.min,
        max: property.max,
        std: property.std,
        n: Object.keys(property.data).length,
        sources: { ...property.data }
    };
}

function toStoredCondition(condition: AggregatedCondition | undefined, includeIsDay: boolean): StoredCondition | undefined {
    const result = condition?.result;
    if (condition == null || result == null) {
        return undefined;
    }
    return {
        ...result,
        isDay: includeIsDay ? condition.isDay : undefined,
        sources: { ...condition.data }
    };
}

function toStoredForecast<T extends { datetime: number, condition: AggregatedCondition }>(series: Series, row: T,
    metricGetters: { [name: string]: (row: T) => AggregatedProperty }, updatedAt: string, skippedSources: string[]): StoredForecast {

    const metrics: { [metric: string]: StoredMetric } = {};
    const sources = new Set<string>();
    for (let name in metricGetters) {
        const metric = toStoredMetric(metricGetters[name](row));
        if (metric) {
            metrics[name] = metric;
            Object.keys(metric.sources).forEach(source => sources.add(source));
        }
    }

    const condition = toStoredCondition(row.condition, series === 'hourly');
    Object.keys(condition?.sources || {}).forEach(source => sources.add(source));

    return {
        series,
        epoch: row.datetime,
        time: toReadablePacificDate(row.datetime, Format.ISO_8601),
        date: moment.unix(row.datetime).tz('America/Los_Angeles').format('YYYY-MM-DD'),
        updatedAt,
        sources: [...sources].sort(),
        skippedSources,
        metrics,
        condition
    };
}

// Builds the items to write for this run: every hour/day in the aggregated data that hasn't started yet
export function buildForecastItems(data: AggregatedWeatherData, nowMillis: number = Date.now()): StoredForecast[] {
    const now = nowMillis / 1000;
    const updatedAt = toReadablePacificDate(nowMillis, Format.ISO_8601);
    const skippedSources = data.skippedDataSources.map(skipped => skipped.dataSourceName);

    const hourly = data.hourly
        .filter(hour => hour.datetime > now)
        .map(hour => toStoredForecast('hourly', hour, HOURLY_METRICS, updatedAt, skippedSources));

    const daily = data.daily
        .filter(day => day.datetime > now)
        .map(day => toStoredForecast('daily', day, DAILY_METRICS, updatedAt, skippedSources));

    return [...hourly, ...daily];
}

export async function storeForecast(data: AggregatedWeatherData) {
    const items = buildForecastItems(data);
    await DDB.batchPut(FORECAST_HISTORY_TABLE_NAME, items);
    console.log(`Stored ${items.filter(item => item.series === 'hourly').length} hourly and ` +
        `${items.filter(item => item.series === 'daily').length} daily forecast items`);
}

export async function getForecasts(series: Series, startEpoch: number, endEpoch: number): Promise<StoredForecast[]> {
    return await DDB.queryRange(FORECAST_HISTORY_TABLE_NAME, 'series', series, 'epoch', startEpoch, endEpoch) as StoredForecast[];
}
