import { httpsGet } from '../../../http';
import { DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { OpenMeteoData } from './openmeteo-data';
import moment from 'moment-timezone';
import { equals } from '../../utilities';
import { cmToIn } from '../../conversions';

const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

const expectedHourlyUnits = {
    "time": "iso8601",
    "temperature_2m": "°F",
    "relativehumidity_2m": "%",
    "precipitation": "inch",
    "rain": "inch",
    "showers": "inch",
    "snowfall": "inch",
    "snow_depth": "ft",
    "windspeed_10m": "mp/h",
    "winddirection_10m": "°",
    "windgusts_10m": "mp/h"
};

const expectedDailyUnits = {
    "time": "iso8601",
    "temperature_2m_max": "°F",
    "temperature_2m_min": "°F",
    "precipitation_sum": "inch",
    "rain_sum": "inch",
    "showers_sum": "inch",
    "snowfall_sum": "inch",
    "windspeed_10m_max": "mp/h",
    "windgusts_10m_max": "mp/h",
    "winddirection_10m_dominant": "°"
}

export async function getOpenMeteoData() {


    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&hourly=temperature_2m,relativehumidity_2m,precipitation,rain,showers,snowfall,snow_depth,windspeed_10m,winddirection_10m,windgusts_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,showers_sum,snowfall_sum,windspeed_10m_max,windgusts_10m_max,winddirection_10m_dominant&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles`;

    const data = await httpsGet(url);
    try {
        const weatherData: OpenMeteoData = JSON.parse(data);
        return weatherData;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

export async function getAsCommonData() {
    const openMeteoData = await getOpenMeteoData();

    if (!equals(expectedHourlyUnits, openMeteoData.hourly_units)) {
        console.log("Unexpected hourly units for openmeteo!");
        console.log("Expected: " + JSON.stringify(expectedHourlyUnits, null, 2));
        console.log("Found: " + JSON.stringify(openMeteoData.hourly_units, null, 2));
        throw Error("Unexpected hourly units for openmeteo!");
    }

    if (!equals(expectedDailyUnits, openMeteoData.daily_units)) {
        console.log("Unexpected daily units for openmeteo!");
        console.log("Expected: " + JSON.stringify(expectedDailyUnits, null, 2));
        console.log("Found: " + JSON.stringify(openMeteoData.daily_units, null, 2));
        throw Error("Unexpected daily units for openmeteo!");
    }

    const hourlyData: HourlyConditions[] = [];
    openMeteoData.hourly.time.forEach((element, index) => {
        hourlyData.push({
            datetime: moment.tz(element, "America/Los_Angeles").unix(),
            temp: openMeteoData.hourly.temperature_2m[index],
            feels_like: undefined!,
            visibility: undefined!,
            pop: undefined!,
            rain: openMeteoData.hourly.precipitation[index],
            snow: openMeteoData.hourly.snowfall[index],
            pressure: undefined!,
            humidity: openMeteoData.hourly.relativehumidity_2m[index],
            dew_point: undefined!,
            uvi: undefined!,
            clouds: undefined!,
            wind_speed: openMeteoData.hourly.windspeed_10m[index],
            wind_deg: openMeteoData.hourly.winddirection_10m[index],
            wind_gust: openMeteoData.hourly.windgusts_10m[index]
        });
    });

    const dailyData: DailyConditions[] = [];
    openMeteoData.daily.time.forEach((element, index) => {
        dailyData.push({
            datetime: moment.tz(element, "America/Los_Angeles").unix(),
            temp: {
                min: openMeteoData.daily.temperature_2m_min[index],
                max: openMeteoData.daily.temperature_2m_max[index],
            },
            pop: undefined!,
            rain: openMeteoData.daily.precipitation_sum[index],
            snow: openMeteoData.daily.snowfall_sum[index],
            pressure: undefined!,
            humidity: undefined!,
            dew_point: undefined!,
            uvi: undefined!,
            clouds: undefined!,
            wind_speed: openMeteoData.daily.windspeed_10m_max[index],
            wind_deg: openMeteoData.daily.winddirection_10m_dominant[index],
            wind_gust: openMeteoData.daily.windgusts_10m_max[index]
        });
    });

    // TODO need to convert units !!!

    return {
        hourly: hourlyData,
        daily: dailyData
    } as WeatherData;
}
