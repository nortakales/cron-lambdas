import { isStatusObject, Status } from "../../../http";
import { getStartOfDay, toReadablePacificDate } from "../../utilities";
import { WeatherData } from "../common/common-data";
import { AggregatedAlertData, AggregatedAngleProperty, AggregatedProperty, AggregatedWeatherData, DailyConditions, HourlyConditions, MinutelyConditions, SkippedDataSource } from "./aggregate-data";
import { dataSources } from "./data-sources";

const TOTAL_DAYS = 8; // All current sources give today + 7 days
const TOTAL_HOURS = 3 * 24 // We have 4 sources for 2 days, the rest for almost 7 days, but that is unneeded

export async function getAggregatedData() {

    const allData: { [key: string]: WeatherData } = {};
    const skippedDataSources: SkippedDataSource[] = [];

    for (let dataSource of dataSources) {
        if (!dataSource.enabled) {
            console.log('Skipping data source "' + dataSource.fullName + '" because it is disabled');
            continue;
        }
        try {
            allData[dataSource.shortCode] = await dataSource.getData();
        } catch (error) {
            let reason;
            console.log("DATA_SOURCE_SKIPPED: Issue processing data source " + dataSource.fullName + ", will continue on without it.");
            if (isStatusObject(error)) {
                console.log("DATA_SOURCE_SKIPPED: " + JSON.stringify(error, null, 2).replace('\\n', '\n').replace('\\n', '\n'));
                reason = (error as Status).statusCode + " " + (error as Status).statusMessage;
            } else {
                console.error(error);
                reason = "Unknown error";
            }
            skippedDataSources.push({
                dataSourceName: dataSource.fullName,
                reason: reason
            });
        }
    }

    // Map of timestamp to MinutelyConditions (currently only OpenWeather provides minutely data)
    const aggregatedMinutelyData: { [key: number]: MinutelyConditions } = {};

    for (let dataSourceName in allData) {
        for (let minutelyData of allData[dataSourceName].minutely || []) {
            const timestamp = minutelyData.datetime;
            const aggregatedData = aggregatedMinutelyData[timestamp];
            if (aggregatedData == null) {
                aggregatedMinutelyData[timestamp] = {
                    datetime: timestamp,
                    precipitation: new AggregatedProperty(dataSourceName, minutelyData.precipitation)
                };
            } else {
                aggregatedData.precipitation.addDataPoint(dataSourceName, minutelyData.precipitation);
            }
        }
    }

    // Official alerts, de-duplicated across sources. Different sources relay the same NWS alert with slightly
    // different start/end times, so treat alerts as the same if they have the same event name (e.g. "Wind
    // Advisory") and their time windows overlap.
    const aggregatedAlerts: AggregatedAlertData[] = [];

    for (let dataSourceName in allData) {
        for (let alert of allData[dataSourceName].alerts || []) {
            const existing = aggregatedAlerts.find(other =>
                other.event?.toLowerCase() === alert.event?.toLowerCase() &&
                other.start <= alert.end && alert.start <= other.end);
            if (existing == null) {
                aggregatedAlerts.push({ ...alert, dataSources: [dataSourceName] });
            } else if (!existing.dataSources.includes(dataSourceName)) {
                existing.dataSources.push(dataSourceName);
            }
        }
    }

    // Map of timestamp to HourlyConditions
    const aggregatedHourlyData: any = {};

    for (let dataSourceName in allData) {
        for (let hourlyData of allData[dataSourceName].hourly) {
            const timestamp = hourlyData.datetime;
            let aggregatedData: HourlyConditions = aggregatedHourlyData[timestamp];
            if (aggregatedData == null) {
                aggregatedData = {
                    datetime: timestamp,
                    pressure: new AggregatedProperty(dataSourceName, hourlyData.pressure),
                    humidity: new AggregatedProperty(dataSourceName, hourlyData.humidity),
                    dew_point: new AggregatedProperty(dataSourceName, hourlyData.dew_point),
                    uvi: new AggregatedProperty(dataSourceName, hourlyData.uvi),
                    clouds: new AggregatedProperty(dataSourceName, hourlyData.clouds),
                    wind_speed: new AggregatedProperty(dataSourceName, hourlyData.wind_speed),
                    wind_deg: new AggregatedAngleProperty(dataSourceName, hourlyData.wind_deg),
                    wind_gust: new AggregatedProperty(dataSourceName, hourlyData.wind_gust),
                    temp: new AggregatedProperty(dataSourceName, hourlyData.temp),
                    feels_like: new AggregatedProperty(dataSourceName, hourlyData.feels_like),
                    visibility: new AggregatedProperty(dataSourceName, hourlyData.visibility),
                    pop: new AggregatedProperty(dataSourceName, hourlyData.pop),
                    rain: new AggregatedProperty(dataSourceName, hourlyData.rain),
                    snow: new AggregatedProperty(dataSourceName, hourlyData.snow)
                }
                aggregatedHourlyData[timestamp] = aggregatedData;
            } else {
                // aggregatedData.pressure.addDataPoint(dataSourceName, hourlyData.pressure);
                // TODO this would be a good one to add back in
                // aggregatedData.humidity.addDataPoint(dataSourceName, hourlyData.humidity);
                // aggregatedData.dew_point.addDataPoint(dataSourceName, hourlyData.dew_point);
                // aggregatedData.uvi.addDataPoint(dataSourceName, hourlyData.uvi);
                // aggregatedData.clouds.addDataPoint(dataSourceName, hourlyData.clouds);
                aggregatedData.wind_speed.addDataPoint(dataSourceName, hourlyData.wind_speed);
                aggregatedData.wind_deg.addDataPoint(dataSourceName, hourlyData.wind_deg);
                aggregatedData.wind_gust.addDataPoint(dataSourceName, hourlyData.wind_gust);
                aggregatedData.temp.addDataPoint(dataSourceName, hourlyData.temp);
                aggregatedData.feels_like.addDataPoint(dataSourceName, hourlyData.feels_like);
                aggregatedData.visibility.addDataPoint(dataSourceName, hourlyData.visibility);
                aggregatedData.pop.addDataPoint(dataSourceName, hourlyData.pop);
                aggregatedData.rain.addDataPoint(dataSourceName, hourlyData.rain);
                aggregatedData.snow.addDataPoint(dataSourceName, hourlyData.snow);
            }
        }
    }

    // Map of timestamp to DailyConditions
    const aggregatedDailyData: any = {};

    for (let dataSourceName in allData) {

        for (let dailyData of allData[dataSourceName].daily) {

            const timestamp = dailyData.datetime;
            let aggregatedData: DailyConditions = aggregatedDailyData[timestamp];
            if (aggregatedData == null) {
                aggregatedData = {
                    datetime: timestamp,
                    temp: {
                        max: new AggregatedProperty(dataSourceName, dailyData.temp.max),
                        min: new AggregatedProperty(dataSourceName, dailyData.temp.min)
                    },
                    pop: new AggregatedProperty(dataSourceName, dailyData.pop),
                    rain: new AggregatedProperty(dataSourceName, dailyData.rain),
                    snow: new AggregatedProperty(dataSourceName, dailyData.snow || 0),
                    wind_speed: new AggregatedProperty(dataSourceName, dailyData.wind_speed),
                    wind_deg: new AggregatedAngleProperty(dataSourceName, dailyData.wind_deg),
                    wind_gust: new AggregatedProperty(dataSourceName, dailyData.wind_gust)
                }
                aggregatedDailyData[timestamp] = aggregatedData;
            } else {
                aggregatedData.temp.max.addDataPoint(dataSourceName, dailyData.temp.max);
                aggregatedData.temp.min.addDataPoint(dataSourceName, dailyData.temp.min);
                aggregatedData.pop.addDataPoint(dataSourceName, dailyData.pop);
                aggregatedData.rain.addDataPoint(dataSourceName, dailyData.rain);
                aggregatedData.snow.addDataPoint(dataSourceName, dailyData.snow || 0);
                aggregatedData.wind_speed.addDataPoint(dataSourceName, dailyData.wind_speed);
                aggregatedData.wind_deg.addDataPoint(dataSourceName, dailyData.wind_deg);
                aggregatedData.wind_gust.addDataPoint(dataSourceName, dailyData.wind_gust);
            }
        }
    }


    // console.log("HOURLY");

    // for (let data in aggregatedHourlyData) {
    //     console.log(`${toReadablePacificDate(+data, Format.DATE_AND_TIME)} ${aggregatedHourlyData[data].wind_deg.data.openweather} ${aggregatedHourlyData[data].wind_deg.data.weathergov} ${aggregatedHourlyData[data].wind_deg.data.tomorrowio}`);
    // }

    // console.log("DAILY");

    // for (let data in aggregatedDailyData) {
    //     console.log(`${toReadablePacificDate(+data, Format.DATE_ONLY)} ${aggregatedDailyData[data].wind_deg.data.openweather} ${aggregatedDailyData[data].wind_deg.data.weathergov} ${aggregatedDailyData[data].wind_deg.data.tomorrowio}`);
    // }

    const now = Date.now() / 1000;
    const today = getStartOfDay(now) / 1000;
    const dailyMax = (today + (TOTAL_DAYS * 86400));
    const hourlyMin = (now - 3600);
    const hourlyMax = (hourlyMin + (TOTAL_HOURS * 3600));
    console.log("Daily min: " + toReadablePacificDate(today));
    console.log("Daily max: " + toReadablePacificDate(dailyMax));
    console.log("Hourly min: " + toReadablePacificDate(hourlyMin));
    console.log("Hourly max: " + toReadablePacificDate(hourlyMax));

    const minutelyMin = now - 60;

    return {
        minutely: Object.values(aggregatedMinutelyData)
            .sort((a, b) => a.datetime - b.datetime)
            .filter(minutelyData => minutelyData.datetime >= minutelyMin),
        alerts: aggregatedAlerts.sort((a, b) => a.start - b.start),
        hourly: Object.values(aggregatedHourlyData)
            .sort((a: any, b: any) => a.datetime - b.datetime)
            .filter((hourlyData: any) => hourlyData.datetime < hourlyMax)
            .filter((hourlyData: any) => hourlyData.datetime > hourlyMin),
        daily: Object.values(aggregatedDailyData)
            .sort((a: any, b: any) => a.datetime - b.datetime)
            .filter((dailyData: any) => dailyData.datetime < dailyMax)
            .filter((dailyData: any) => dailyData.datetime >= today),
        skippedDataSources: skippedDataSources
    } as AggregatedWeatherData;
}
