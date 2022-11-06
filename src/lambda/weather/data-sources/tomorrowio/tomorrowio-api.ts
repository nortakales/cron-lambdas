import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { CurrentConditions, DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { getStartOfDay } from '../../utilities';
import queryString from 'query-string';
import { TomorrowIOData } from './tomorrowio-data';

const API_KEY_SECRET_TOMORROW_IO = process.env.API_KEY_SECRET_TOMORROW_IO!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Reference: https://docs.tomorrow.io/reference/get-timelines

// set the Timelines GET endpoint as the target URL
const getTimelineURL = "https://api.tomorrow.io/v4/timelines";

export async function getTomorrowIOData() {

    const apikey = await SM.getSecretString(API_KEY_SECRET_TOMORROW_IO);

    const location = [LATITUDE, LONGITUDE];

    // list the fields, reference: https://docs.tomorrow.io/reference/data-layers-core
    const fields = [
        "precipitationProbability",
        "precipitationIntensity",
        "precipitationType",
        "rainAccumulation",
        "snowAccumulation",
        "iceAccumulation",
        "windSpeed",
        "windGust",
        "windDirection",
        "temperature",
        "temperatureMax",
        "temperatureMin",
        "temperatureApparent",
        "cloudCover",
        "cloudBase",
        "cloudCeiling",
        "weatherCode",
        "humidity",
        "pressureSurfaceLevel",
        "dewPoint",
        "uvIndex"
    ];

    // choose the unit system, either metric or imperial
    const units = "imperial";

    // set the timesteps, like "current", "1h" and "1d"
    const timesteps = ["current", "1h", "1d"];

    const millis7Days = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startTime = now.toISOString();
    const endTime = new Date(now.getTime() + millis7Days).toISOString();

    // specify the timezone, using standard IANA timezone format
    const timezone = "America/Los_Angeles";

    const queryStringParams = queryString.stringify({
        apikey,
        location,
        fields,
        units,
        timesteps,
        startTime,
        endTime,
        timezone,
    }, {
        arrayFormat: "comma"
    });


    let data;
    try {
        data = await httpsGet(getTimelineURL + "?" + queryStringParams);
        const weatherData: TomorrowIOData = JSON.parse(data);
        //console.log(JSON.stringify(weatherData, null, 2));
        return weatherData;
    } catch (error) {
        console.log(JSON.stringify(error, null, 2));
        console.log("Dumping weather data:");
        console.log(data);
        throw error;
    }
}

export async function getAsCommonData() {
    const tomorrowIoData = await getTomorrowIOData();

    let currentConditions: CurrentConditions;
    let hourlyCondituions: HourlyConditions[] = [];
    let dailyConditions: DailyConditions[] = [];

    for (let timeline of tomorrowIoData.data.timelines) {
        if (timeline.timestep === 'current') {
            const values = timeline.intervals[0].values;
            currentConditions = {
                datetime: new Date(timeline.startTime).getTime() / 1000,

                pressure: values.pressureSurfaceLevel,
                humidity: values.humidity,
                dew_point: values.dewPoint,
                uvi: values.uvIndex,
                clouds: values.cloudCover,

                wind_speed: values.windSpeed,
                wind_deg: values.windDirection,
                wind_gust: values.windGust,

                temp: values.temperature,
                feels_like: values.temperatureApparent,
                visibility: values.visibility
            }
        }
        if (timeline.timestep === '1h') {

            for (let interval of timeline.intervals) {
                const values = interval.values;
                hourlyCondituions.push({
                    datetime: new Date(interval.startTime).getTime() / 1000,

                    temp: values.temperature,
                    feels_like: values.temperatureApparent,

                    visibility: values.visibility,

                    // TODO - use precipType
                    // 0: N/A
                    // 1: Rain
                    // 2: Snow
                    // 3: Freezing Rain
                    // 4: Ice Pellets / Sleet
                    pop: values.precipitationProbability,
                    rain: values.precipitationIntensity,
                    snow: values.snowAccumulation,

                    pressure: values.pressureSurfaceLevel,
                    humidity: values.humidity,
                    dew_point: values.dewPoint,
                    uvi: values.uvIndex,
                    clouds: values.cloudCover,

                    wind_speed: values.windSpeed,
                    wind_deg: values.windDirection,
                    wind_gust: values.windGust
                });
            }

        }
        if (timeline.timestep === '1d') {

            for (let interval of timeline.intervals) {
                const values = interval.values;
                dailyConditions.push({
                    datetime: getStartOfDay(new Date(interval.startTime).getTime()) / 1000, // Don't need millis

                    temp: {
                        max: values.temperatureMax,
                        min: values.temperatureMin
                    },

                    // TODO - use precipType
                    // 0: N/A
                    // 1: Rain
                    // 2: Snow
                    // 3: Freezing Rain
                    // 4: Ice Pellets / Sleet
                    pop: values.precipitationProbability,
                    rain: values.precipitationIntensity,
                    snow: values.snowAccumulation,

                    pressure: values.pressureSurfaceLevel,
                    humidity: values.humidity,
                    dew_point: values.dewPoint,
                    uvi: values.uvIndex,
                    clouds: values.cloudCover,

                    wind_speed: values.windSpeed,
                    wind_deg: values.windDirection,
                    wind_gust: values.windGust
                });
            }
        }
    }

    const commonWeatherData: WeatherData = {
        current: currentConditions!,
        hourly: hourlyCondituions,
        daily: dailyConditions
    };

    //console.log(JSON.stringify(commonWeatherData, null, 2));
    return commonWeatherData;
}
