import { Format, toReadablePacificDate } from "../../utilities";
import { WeatherData } from "../common/common-data";
import * as openweather from "../openweather/opwenweather";
import * as weathergov from "../weathergov/weathergov";
import * as tomorrowio from "../tomorrowio/tomorrowio-api";
import * as visualcrossing from "../visualcrossing/visualcrossing-api";
import { AggregatedProperty, AggregatedWeatherData, DailyConditions, HourlyConditions } from "./aggregate-data";

export async function getAggregatedData() {

    const openWeatherData = await openweather.getAsCommonData();
    const weathergovData = await weathergov.getAsCommonData();
    const tomorrowIOData = await tomorrowio.getAsCommonData();
    const visualCrossingData = await visualcrossing.getAsCommonData();

    const allData: { [key: string]: WeatherData } = {
        ow: openWeatherData,
        wg: weathergovData,
        ti: tomorrowIOData,
        vc: visualCrossingData
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

    return {
        hourly: Object.values(aggregatedHourlyData).sort((a: any, b: any) => a.datetime - b.datetime),
        daily: Object.values(aggregatedDailyData).sort((a: any, b: any) => a.datetime - b.datetime)
    } as AggregatedWeatherData;
}
