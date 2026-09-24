import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { AlertData, DailyConditions, HourlyConditions, MinutelyConditions, WeatherData } from '../common/common-data';
import { PirateWeatherData } from './pirateweather-data';

const API_KEY_SECRET_PIRATE_WEATHER = process.env.API_KEY_SECRET_PIRATE_WEATHER!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Reference: https://docs.pirateweather.net/en/latest/API/
// Free plan: 10,000 calls/month, 1 call per run.

export async function getPirateWeatherData() {

    const apiKey = await SM.getSecretString(API_KEY_SECRET_PIRATE_WEATHER);

    // units=us: F, mph, inches, miles. extend=hourly: 168 hours instead of 48. version=2: adds
    // liquidAccumulation/snowAccumulation/iceAccumulation fields.
    const url = `https://api.pirateweather.net/forecast/${apiKey}/${LATITUDE},${LONGITUDE}?units=us&extend=hourly&version=2`;

    const data = await httpsGet(url);
    try {
        const weatherData: PirateWeatherData = JSON.parse(data);
        return weatherData;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

export async function getAsCommonData() {
    const data = await getPirateWeatherData();

    if (data.flags?.units !== 'us') {
        throw Error("Unexpected units for Pirate Weather: " + data.flags?.units);
    }

    const minutely: MinutelyConditions[] = (data.minutely?.data || []).map(minute => ({
        datetime: minute.time,
        precipitation: minute.precipIntensity // in/hr
    }));

    const hourly: HourlyConditions[] = data.hourly.data.map(hour => ({
        datetime: hour.time,

        temp: hour.temperature,
        feels_like: hour.apparentTemperature,

        visibility: hour.visibility,

        pop: hour.precipProbability * 100,
        rain: hour.liquidAccumulation,
        snow: hour.snowAccumulation,

        pressure: hour.pressure,
        humidity: hour.humidity * 100,
        dew_point: hour.dewPoint,
        uvi: hour.uvIndex,
        clouds: hour.cloudCover * 100,

        wind_speed: hour.windSpeed,
        wind_deg: hour.windBearing,
        wind_gust: hour.windGust
    }));

    // Pirate Weather's daily windSpeed/windGust are daily AVERAGES (Dark Sky semantics), while every other
    // source reports the day's max. Use the max of the hourly values instead (for today, that's the rest of
    // the day). For the day where the hourly data (168 hours) runs out, leave it undefined so PW is just
    // excluded from wind for that day rather than using a partial max or the daily average.
    const lastHour = Math.max(...data.hourly.data.map(hour => hour.time));
    const maxHourly = (dayStart: number, field: 'windSpeed' | 'windGust') => {
        if (dayStart + 86400 - 3600 > lastHour) {
            return undefined;
        }
        const values = data.hourly.data
            .filter(hour => hour.time >= dayStart && hour.time < dayStart + 86400 && hour[field] != null)
            .map(hour => hour[field]);
        return values.length ? Math.max(...values) : undefined;
    };

    const daily: DailyConditions[] = data.daily.data.map(day => ({
        // Local midnight
        datetime: day.time,

        sunrise: day.sunriseTime,
        sunset: day.sunsetTime,
        moon_phase: day.moonPhase,

        // temperatureMax/Min are for the calendar day (midnight to midnight), which matches the other sources.
        // temperatureHigh/Low are daytime high and overnight low.
        temp: {
            min: day.temperatureMin,
            max: day.temperatureMax
        },

        pop: day.precipProbability * 100,
        rain: day.liquidAccumulation,
        snow: day.snowAccumulation,

        pressure: day.pressure,
        humidity: day.humidity * 100,
        dew_point: day.dewPoint,
        uvi: day.uvIndex,
        clouds: day.cloudCover * 100,

        wind_speed: maxHourly(day.time, 'windSpeed')!,
        wind_deg: day.windBearing,
        wind_gust: maxHourly(day.time, 'windGust')!
    }));

    const alerts: AlertData[] = (data.alerts || []).map(alert => ({
        sender_name: 'Pirate Weather (' + (alert.regions || []).slice(0, 3).join(', ') + ')',
        event: alert.title,
        start: alert.time, // when the alert was issued, not necessarily when the hazard starts
        end: alert.expires,
        description: alert.description,
        tags: [alert.severity]
    }));

    return {
        current: undefined!,
        minutely,
        hourly,
        daily,
        alerts
    } as WeatherData;
}
