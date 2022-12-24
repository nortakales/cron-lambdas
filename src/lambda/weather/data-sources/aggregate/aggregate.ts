import { getStartOfDay, toReadablePacificDate } from "../../utilities";
import { WeatherData } from "../common/common-data";
import * as openweather from "../openweather/openweather-api";
import * as weathergov from "../weathergov/weathergov-api";
import * as tomorrowio from "../tomorrowio/tomorrowio-api";
import * as visualcrossing from "../visualcrossing/visualcrossing-api";
import { AggregatedProperty, AggregatedWeatherData, DailyConditions, HourlyConditions } from "./aggregate-data";
import * as meteomatics from "../meteomatics/meteomatics-api";
import * as openmeteo from "../openmeteo/openmeteo-api";
import * as accuweather from "../accuweather/accuweather-api";

const TOTAL_DAYS = 8; // All current sources give today + 7 days
const TOTAL_HOURS = 3 * 24 // We have 4 sources for 2 days, the rest for almost 7 days, but that is unneeded

export interface DataSource {
    readonly fullName: string,
    readonly shortCode: string,
    getData(): Promise<WeatherData>
}

const dataSources: DataSource[] = [
    {
        fullName: "OpenWeather",
        shortCode: "ow",
        getData: async function () {
            return await openweather.getAsCommonData();
        }
    },
    {
        fullName: "Weather.gov",
        shortCode: "wg",
        getData: async function () {
            return await weathergov.getAsCommonData();
        }
    },
    {
        fullName: "TomorrowIO",
        shortCode: "ti",
        getData: async function () {
            return await tomorrowio.getAsCommonData();
        }
    },
    {
        fullName: "VisualCrossing",
        shortCode: "vc",
        getData: async function () {
            return await visualcrossing.getAsCommonData();
        }
    },
    {
        fullName: "Meteomatics",
        shortCode: "mm",
        getData: async function () {
            return await meteomatics.getAsCommonData();
        }
    },
    {
        fullName: "OpenMeteo",
        shortCode: "om",
        getData: async function () {
            return await openmeteo.getAsCommonData();
        }
    },
    {
        fullName: "AccuWeather",
        shortCode: "aw",
        getData: async function () {
            return await accuweather.getAsCommonData();
        }
    },
]

export async function getAggregatedData() {

    const allData: { [key: string]: WeatherData } = {};

    for (let dataSource of dataSources) {
        try {
            allData[dataSource.shortCode] = await dataSource.getData();
        } catch (error) {
            // TODO well unfortunately this doesn't work - need a lot of refactoring to get it working
            // The issue is that all of the async/await calls are executing in another call stack
            console.log("ERROR: Error processing data source " + dataSource.fullName + ", will continue on without it.");
            console.log(error);
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
                    wind_deg: new AggregatedProperty(dataSourceName, hourlyData.wind_deg),
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
                    wind_deg: new AggregatedProperty(dataSourceName, dailyData.wind_deg),
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

    return {
        hourly: Object.values(aggregatedHourlyData)
            .sort((a: any, b: any) => a.datetime - b.datetime)
            .filter((hourlyData: any) => hourlyData.datetime < hourlyMax)
            .filter((hourlyData: any) => hourlyData.datetime > hourlyMin),
        daily: Object.values(aggregatedDailyData)
            .sort((a: any, b: any) => a.datetime - b.datetime)
            .filter((dailyData: any) => dailyData.datetime < dailyMax)
            .filter((dailyData: any) => dailyData.datetime >= today)
    } as AggregatedWeatherData;
}
