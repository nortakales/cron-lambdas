import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { OpenWeatherData } from './openweather-data';
import { WeatherData } from '../common/common-data';
import { getStartOfDay } from '../../utilities';
import { mmToIn, mToMi } from '../../conversions';

const API_KEY_SECRET_OPEN_WEATHER = process.env.API_KEY_SECRET_OPEN_WEATHER!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

export async function getOpenWeatherData() {

    const apiKey = await SM.getSecretString(API_KEY_SECRET_OPEN_WEATHER);

    // https://api.openweathermap.org/data/3.0/onecall?lat=47.806994&lon=-122.192443&lang=en&units=imperial&appid=
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${apiKey}&lang=en&units=imperial`;

    const data = await httpsGet(url);
    try {
        const weatherData: OpenWeatherData = JSON.parse(data);
        return weatherData;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

export async function getAsCommonData() {
    const openWeatherData = await getOpenWeatherData();
    const commonWeatherData: WeatherData = {
        current: {
            datetime: openWeatherData.current.dt,

            pressure: openWeatherData.current.pressure,
            humidity: openWeatherData.current.humidity,
            dew_point: openWeatherData.current.dew_point,
            uvi: openWeatherData.current.uvi,
            clouds: openWeatherData.current.clouds,

            wind_speed: openWeatherData.current.wind_speed,
            wind_deg: openWeatherData.current.wind_deg,
            wind_gust: openWeatherData.current.wind_gust,

            temp: openWeatherData.current.temp,
            feels_like: openWeatherData.current.feels_like,
            visibility: mToMi(openWeatherData.current.visibility)
        },
        // Minutely data may not be present if there is no rain
        minutely: openWeatherData.minutely ? openWeatherData.minutely.map(minutely => ({
            datetime: minutely.dt,
            precipitation: mmToIn(minutely.precipitation)
        })) : [],
        hourly: openWeatherData.hourly.map(hourly => ({
            datetime: hourly.dt,

            temp: hourly.temp,
            feels_like: hourly.feels_like,

            visibility: mToMi(hourly.visibility),

            pop: hourly.pop * 100,
            rain: mmToIn(hourly.rain?.['1h'] || 0),
            snow: mmToIn(hourly.snow?.['1h'] || 0),

            pressure: hourly.pressure,
            humidity: hourly.humidity,
            dew_point: hourly.dew_point,
            uvi: hourly.uvi,
            clouds: hourly.clouds,

            wind_speed: hourly.wind_speed,
            wind_deg: hourly.wind_deg,
            wind_gust: hourly.wind_gust
        })),
        daily: openWeatherData.daily.map(daily => ({
            // In March, this was -8 at noon, and -8 at 1PM for DST crossover
            datetime: getStartOfDay(daily.dt) / 1000, // Don't need millis

            sunrise: daily.sunrise,
            sunset: daily.sunset,

            moonrise: daily.moonrise,
            moonset: daily.moonset,
            moon_phase: daily.moon_phase,

            temp: {
                min: daily.temp.min,
                max: daily.temp.max,
                morn: daily.temp.morn,
                day: daily.temp.day,
                eve: daily.temp.eve,
                night: daily.temp.night
            },
            feels_like: {
                morn: daily.feels_like.morn,
                day: daily.feels_like.day,
                eve: daily.feels_like.eve,
                night: daily.feels_like.night
            },

            pop: daily.pop * 100,
            rain: mmToIn(daily.rain || 0),
            snow: mmToIn(daily.snow || 0),

            pressure: daily.pressure,
            humidity: daily.humidity,
            dew_point: daily.dew_point,
            uvi: daily.uvi,
            clouds: daily.clouds,

            wind_speed: daily.wind_speed,
            wind_deg: daily.wind_deg,
            wind_gust: daily.wind_gust
        })),
        alerts: openWeatherData.alerts == null ? [] : openWeatherData.alerts.map(alert => ({
            sender_name: alert.sender_name,
            event: alert.event,
            start: alert.start,
            end: alert.end,
            description: alert.description,
            tags: alert.tags
        }))
    };

    return commonWeatherData;
}
