import * as crypto from 'crypto';
import moment from 'moment-timezone';
import * as SM from '../secrets';
import { startLambdaLog } from '../utilities/logging';
import { getForecasts, Series, StoredForecast } from './history/forecast-history';
import { dataSources } from './data-sources/aggregate/data-sources';
import { CONDITIONS } from './conditions/conditions';

// Read-only API over the forecast history table. See docs/weather-alert-system.md "Forecast history & API".
//
//   GET /forecast?breakout=true|false                     next 72 hours + today and the next 7 days
//   GET /hourly?start=&end=&breakout=true|false           default: next 72 hours, max range 31 days
//   GET /daily?start=&end=&breakout=true|false            default: today + 7 days, max range 366 days
//   GET /sources                                          data source short codes/names and metric units
//
// start/end: epoch seconds, or an ISO 8601 date/time (interpreted in America/Los_Angeles if it has no offset).
// Both inclusive. Requires the API key in the `x-api-key` header.

const API_KEY_SECRET_WEATHER_DATA_API = process.env.API_KEY_SECRET_WEATHER_DATA_API!;
const TIMEZONE = 'America/Los_Angeles';

const HOUR = 3600;
const DAY = 86400;
const DEFAULT_HOURS = 72;
const DEFAULT_DAYS = 8;
const MAX_HOURLY_RANGE = 31 * DAY;
const MAX_DAILY_RANGE = 366 * DAY;

const METRIC_UNITS = {
    hourly: {
        temp: '°F', feels_like: '°F', visibility: 'mi', pop: '%', rain: 'in', snow: 'in',
        wind_speed: 'mph', wind_deg: '° (direction the wind comes from)', wind_gust: 'mph'
    },
    daily: {
        temp_max: '°F', temp_min: '°F', pop: '% (max for the day)', rain: 'in (total)', snow: 'in (total)',
        wind_speed: 'mph (max)', wind_deg: '° (direction the wind comes from)', wind_gust: 'mph (max)'
    }
};

class HttpError extends Error {
    constructor(readonly statusCode: number, message: string) {
        super(message);
    }
}

let cachedApiKey: string | undefined;

async function verifyApiKey(headers: { [key: string]: string } | null) {
    const provided = Object.entries(headers || {}).find(([name]) => name.toLowerCase() === 'x-api-key')?.[1];
    if (!cachedApiKey) {
        cachedApiKey = await SM.getSecretString(API_KEY_SECRET_WEATHER_DATA_API);
    }
    const expected = Buffer.from(cachedApiKey!);
    const actual = Buffer.from(provided || '');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw new HttpError(401, 'Missing or incorrect x-api-key header');
    }
}

function parseTime(value: string | undefined, name: string): number | undefined {
    if (value == null || value === '') {
        return undefined;
    }
    if (/^\d+$/.test(value)) {
        return +value;
    }
    const parsed = moment.tz(value, moment.ISO_8601, TIMEZONE);
    if (!parsed.isValid()) {
        throw new HttpError(400, `Invalid ${name}: ${value} (expected epoch seconds or ISO 8601)`);
    }
    return parsed.unix();
}

function stripBreakout(forecasts: StoredForecast[], breakout: boolean) {
    if (breakout) {
        return forecasts;
    }
    return forecasts.map(forecast => {
        const { sources, ...condition } = forecast.condition || {} as any;
        return {
            ...forecast,
            metrics: Object.fromEntries(Object.entries(forecast.metrics).map(([name, metric]) => {
                const { sources, ...stats } = metric;
                return [name, stats];
            })),
            condition: forecast.condition ? condition : undefined
        };
    });
}

async function getSeries(series: Series, params: { [key: string]: string }, breakout: boolean) {
    const now = Date.now() / 1000;
    const defaultStart = series === 'hourly'
        ? Math.floor(now / HOUR) * HOUR
        : moment.unix(now).tz(TIMEZONE).startOf('day').unix();
    const start = parseTime(params.start, 'start') ?? defaultStart;
    const defaultEnd = series === 'hourly'
        ? start + (DEFAULT_HOURS - 1) * HOUR
        : moment.unix(start).tz(TIMEZONE).add(DEFAULT_DAYS - 1, 'days').unix();
    const end = parseTime(params.end, 'end') ?? defaultEnd;

    if (end < start) {
        throw new HttpError(400, 'end must not be before start');
    }
    const maxRange = series === 'hourly' ? MAX_HOURLY_RANGE : MAX_DAILY_RANGE;
    if (end - start > maxRange) {
        throw new HttpError(400, `Range too large for ${series}, max is ${maxRange / DAY} days`);
    }

    return stripBreakout(await getForecasts(series, start, end), breakout);
}

function response(statusCode: number, body: any) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            // Data only changes every 30 minutes
            'Cache-Control': statusCode === 200 ? 'max-age=300' : 'no-store'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event: any = {}, context: any = {}) => {
    // Don't log the API key (API Gateway includes it in both headers and multiValueHeaders)
    const redact = (headers: any) => headers && Object.fromEntries(Object.entries(headers)
        .map(([name, value]) => [name, name.toLowerCase() === 'x-api-key' ? 'REDACTED' : value]));
    startLambdaLog({ ...event, headers: redact(event.headers), multiValueHeaders: redact(event.multiValueHeaders) }, context, process.env);

    try {
        await verifyApiKey(event.headers);

        const params: { [key: string]: string } = event.queryStringParameters || {};
        const breakout = params.breakout === 'true';
        const generatedAt = moment().tz(TIMEZONE).format();

        switch (event.resource || event.path) {
            case '/forecast':
                return response(200, {
                    generatedAt,
                    hourly: await getSeries('hourly', {}, breakout),
                    daily: await getSeries('daily', {}, breakout)
                });
            case '/hourly':
                return response(200, { generatedAt, hourly: await getSeries('hourly', params, breakout) });
            case '/daily':
                return response(200, { generatedAt, daily: await getSeries('daily', params, breakout) });
            case '/sources':
                return response(200, {
                    sources: dataSources.map(source => ({ shortCode: source.shortCode, name: source.fullName, enabled: source.enabled })),
                    units: METRIC_UNITS,
                    conditions: CONDITIONS
                });
            default:
                throw new HttpError(404, `Unknown path: ${event.path}`);
        }
    } catch (error) {
        if (error instanceof HttpError) {
            console.log(`Returning ${error.statusCode}: ${error.message}`);
            return response(error.statusCode, { error: error.message });
        }
        console.error('ERROR handling weather data API request', error);
        return response(500, { error: 'Internal error' });
    }
};

// Uncomment this to call locally
// exports.handler({ resource: '/forecast', headers: { 'x-api-key': '' }, queryStringParameters: { breakout: 'true' } });
