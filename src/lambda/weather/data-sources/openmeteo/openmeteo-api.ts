import { httpsGet } from '../../../http';
import { DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { OpenMeteoData } from './openmeteo-data';
import moment from 'moment-timezone';
import { equals } from '../../utilities';
import { fromWmoCode } from '../../conditions/conditions';

const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Reference: https://open-meteo.com/en/docs

const hourlyVariables = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation_probability',
    'precipitation',
    'snowfall',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'weather_code',
    'is_day'
];

const dailyVariables = [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'snowfall_sum',
    'wind_speed_10m_max',
    'wind_gusts_10m_max',
    'wind_direction_10m_dominant',
    'weather_code'
];

const expectedHourlyUnits = {
    "time": "iso8601",
    "temperature_2m": "°F",
    "apparent_temperature": "°F",
    "relative_humidity_2m": "%",
    "precipitation_probability": "%",
    "precipitation": "inch",
    "snowfall": "inch",
    "wind_speed_10m": "mp/h",
    "wind_direction_10m": "°",
    "wind_gusts_10m": "mp/h",
    "weather_code": "wmo code",
    "is_day": ""
};

const expectedDailyUnits = {
    "time": "iso8601",
    "temperature_2m_max": "°F",
    "temperature_2m_min": "°F",
    "precipitation_probability_max": "%",
    "precipitation_sum": "inch",
    "snowfall_sum": "inch",
    "wind_speed_10m_max": "mp/h",
    "wind_gusts_10m_max": "mp/h",
    "wind_direction_10m_dominant": "°",
    "weather_code": "wmo code"
}

// model: an Open-Meteo model id (e.g. "ecmwf_ifs"), or undefined for Open-Meteo's default "best_match",
// which for this location is HRRR for ~48 hours and then GFS.
// When a single model is requested, the response keys are NOT suffixed with the model name.
export async function getOpenMeteoData(model?: string) {

    const modelParam = model ? `&models=${model}` : '';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
        `&hourly=${hourlyVariables.join(',')}&daily=${dailyVariables.join(',')}${modelParam}` +
        `&forecast_days=8&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles`;

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

export async function getAsCommonData(model?: string) {
    const openMeteoData = await getOpenMeteoData(model);
    const name = `openmeteo (${model || 'best_match'})`;

    if (!equals(expectedHourlyUnits, openMeteoData.hourly_units)) {
        console.log(`Unexpected hourly units for ${name}!`);
        console.log("Expected: " + JSON.stringify(expectedHourlyUnits, null, 2));
        console.log("Found: " + JSON.stringify(openMeteoData.hourly_units, null, 2));
        throw Error(`Unexpected hourly units for ${name}!`);
    }

    if (!equals(expectedDailyUnits, openMeteoData.daily_units)) {
        console.log(`Unexpected daily units for ${name}!`);
        console.log("Expected: " + JSON.stringify(expectedDailyUnits, null, 2));
        console.log("Found: " + JSON.stringify(openMeteoData.daily_units, null, 2));
        throw Error(`Unexpected daily units for ${name}!`);
    }

    const hourly = openMeteoData.hourly;
    const hourlyData: HourlyConditions[] = [];
    hourly.time.forEach((element, index) => {
        // Models don't all cover the full 8 days (e.g. UKMO ~7), hours past a model's range come back as null.
        // Skip those so they don't show up as rows full of missing/zero values.
        if (hourly.temperature_2m[index] == null) {
            return;
        }
        hourlyData.push({
            datetime: moment.tz(element, "America/Los_Angeles").unix(),
            temp: hourly.temperature_2m[index],
            feels_like: hourly.apparent_temperature[index],
            visibility: undefined!,
            pop: hourly.precipitation_probability[index],
            rain: hourly.precipitation[index],
            snow: hourly.snowfall[index],
            pressure: undefined!,
            humidity: hourly.relative_humidity_2m[index],
            dew_point: undefined!,
            uvi: undefined!,
            clouds: undefined!,
            wind_speed: hourly.wind_speed_10m[index],
            wind_deg: hourly.wind_direction_10m[index],
            wind_gust: hourly.wind_gusts_10m[index],
            condition: fromWmoCode(hourly.weather_code[index]),
            is_day: hourly.is_day[index] == null ? undefined : hourly.is_day[index] === 1
        });
    });

    const daily = openMeteoData.daily;
    const dailyData: DailyConditions[] = [];
    daily.time.forEach((element, index) => {
        if (daily.temperature_2m_max[index] == null) {
            return;
        }
        dailyData.push({
            datetime: moment.tz(element, "America/Los_Angeles").unix(),
            temp: {
                min: daily.temperature_2m_min[index],
                max: daily.temperature_2m_max[index],
            },
            pop: daily.precipitation_probability_max[index],
            rain: daily.precipitation_sum[index],
            snow: daily.snowfall_sum[index],
            pressure: undefined!,
            humidity: undefined!,
            dew_point: undefined!,
            uvi: undefined!,
            clouds: undefined!,
            wind_speed: daily.wind_speed_10m_max[index],
            wind_deg: daily.wind_direction_10m_dominant[index],
            wind_gust: daily.wind_gusts_10m_max[index],
            // Open-Meteo's daily weather_code is the most severe condition of the whole day (no daytime-only version)
            condition: fromWmoCode(daily.weather_code[index])
        });
    });

    return {
        hourly: hourlyData,
        daily: dailyData
    } as WeatherData;
}
