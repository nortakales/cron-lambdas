import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { averageAngle } from '../../utilities';
import { GoogleWeatherDailyResponse, GoogleWeatherHourlyResponse, GoogleWeatherHour } from './googleweather-data';
import moment from 'moment-timezone';
import { fromGoogleType } from '../../conditions/conditions';

const API_KEY_SECRET_GOOGLE_WEATHER = process.env.API_KEY_SECRET_GOOGLE_WEATHER!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Reference: https://developers.google.com/maps/documentation/weather
// Pricing: 10,000 free calls/month across all Weather API endpoints, then $0.15 per 1,000.
// Each page is a billable call. Hourly pages are capped at 24 hours regardless of pageSize, so 72 hours
// is 3 calls, plus 1 call for 8 days of daily data (4 per run, ~5,800/month at every 30 minutes).
const HOURS = 72;
const DAYS = 8;

const BASE_URL = 'https://weather.googleapis.com/v1/forecast';

async function getJson<T>(url: string): Promise<T> {
    const data = await httpsGet(url);
    try {
        return JSON.parse(data) as T;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

export async function getGoogleWeatherData() {

    const apiKey = await SM.getSecretString(API_KEY_SECRET_GOOGLE_WEATHER);
    const params = `key=${apiKey}&location.latitude=${LATITUDE}&location.longitude=${LONGITUDE}&unitsSystem=IMPERIAL`;

    const hours: GoogleWeatherHour[] = [];
    let pageToken: string | undefined;
    do {
        const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const page = await getJson<GoogleWeatherHourlyResponse>(`${BASE_URL}/hours:lookup?${params}&hours=${HOURS}&pageSize=24${pageParam}`);
        hours.push(...(page.forecastHours || []));
        pageToken = page.nextPageToken;
    } while (pageToken && hours.length < HOURS);

    const daily = await getJson<GoogleWeatherDailyResponse>(`${BASE_URL}/days:lookup?${params}&days=${DAYS}&pageSize=${DAYS}`);

    return {
        hours,
        days: daily.forecastDays || []
    };
}

function checkUnit(actual: string | undefined, expected: string, field: string) {
    if (actual !== undefined && actual !== expected) {
        throw Error(`Unexpected units for Google Weather ${field}: ${actual}`);
    }
}

export async function getAsCommonData() {
    const data = await getGoogleWeatherData();

    const hourly: HourlyConditions[] = data.hours.map(hour => {
        checkUnit(hour.temperature?.unit, 'FAHRENHEIT', 'temperature');
        checkUnit(hour.wind?.speed?.unit, 'MILES_PER_HOUR', 'wind speed');
        checkUnit(hour.wind?.gust?.unit, 'MILES_PER_HOUR', 'wind gust');
        checkUnit(hour.precipitation?.qpf?.unit, 'INCHES', 'qpf');
        checkUnit(hour.precipitation?.snowQpf?.unit, 'INCHES', 'snowQpf');
        checkUnit(hour.visibility?.unit, 'MILES', 'visibility');

        return {
            datetime: new Date(hour.interval.startTime).getTime() / 1000,

            temp: hour.temperature?.degrees,
            feels_like: hour.feelsLikeTemperature?.degrees,

            visibility: hour.visibility?.distance,

            pop: hour.precipitation?.probability?.percent,
            rain: hour.precipitation?.qpf?.quantity,
            snow: hour.precipitation?.snowQpf?.quantity,

            pressure: hour.airPressure?.meanSeaLevelMillibars,
            humidity: hour.relativeHumidity,
            dew_point: hour.dewPoint?.degrees,
            uvi: hour.uvIndex,
            clouds: hour.cloudCover,

            wind_speed: hour.wind?.speed?.value,
            wind_deg: hour.wind?.direction?.degrees,
            wind_gust: hour.wind?.gust?.value,

            condition: fromGoogleType(hour.weatherCondition?.type),
            is_day: hour.isDaytime
        } as HourlyConditions;
    });

    const daily: DailyConditions[] = data.days.map(day => {
        checkUnit(day.maxTemperature?.unit, 'FAHRENHEIT', 'max temperature');
        checkUnit(day.minTemperature?.unit, 'FAHRENHEIT', 'min temperature');

        // Google's day runs 7 AM to 7 AM local, split into daytime and nighttime halves
        const halves = [day.daytimeForecast, day.nighttimeForecast].filter(half => half != null);
        for (let half of halves) {
            checkUnit(half.wind?.speed?.unit, 'MILES_PER_HOUR', 'daily wind speed');
            checkUnit(half.wind?.gust?.unit, 'MILES_PER_HOUR', 'daily wind gust');
            checkUnit(half.precipitation?.qpf?.unit, 'INCHES', 'daily qpf');
            checkUnit(half.precipitation?.snowQpf?.unit, 'INCHES', 'daily snowQpf');
        }
        const max = (values: (number | undefined)[]) => {
            const defined = values.filter(value => value != null) as number[];
            return defined.length ? Math.max(...defined) : undefined;
        };
        const sum = (values: (number | undefined)[]) => {
            const defined = values.filter(value => value != null) as number[];
            return defined.length ? defined.reduce((a, b) => a + b, 0) : undefined;
        };

        const displayDate = `${day.displayDate.year}-${String(day.displayDate.month).padStart(2, '0')}-${String(day.displayDate.day).padStart(2, '0')}`;

        return {
            // Local midnight of the forecast date, to line up with the other sources
            datetime: moment.tz(displayDate, "America/Los_Angeles").unix(),

            temp: {
                min: day.minTemperature?.degrees,
                max: day.maxTemperature?.degrees
            },

            pop: max(halves.map(half => half.precipitation?.probability?.percent)),
            rain: sum(halves.map(half => half.precipitation?.qpf?.quantity)),
            snow: sum(halves.map(half => half.precipitation?.snowQpf?.quantity)),

            humidity: undefined,
            clouds: undefined,

            wind_speed: max(halves.map(half => half.wind?.speed?.value)),
            wind_deg: averageAngle(halves.map(half => ({
                angle: half.wind?.direction?.degrees,
                speed: half.wind?.speed?.value
            }))),
            wind_gust: max(halves.map(half => half.wind?.gust?.value)),

            condition: fromGoogleType(day.daytimeForecast?.weatherCondition?.type) // daytime condition
        } as unknown as DailyConditions;
    });

    return {
        current: undefined!,
        hourly,
        daily
    } as WeatherData;
}
