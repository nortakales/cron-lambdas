import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import moment from 'moment-timezone';
import { MeteomaticsData } from './meteomatics-data';
import { AngleAndSpeed, averageAngle, Format, getStartOfDay, toReadablePacificDate } from '../../utilities';
import { WeatherData } from '../common/common-data';
import { mmToIn } from '../../conversions';

const API_CREDENTIALS_SECRET_METEOMATICS = process.env.API_CREDENTIALS_SECRET_METEOMATICS!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

export async function getMeteomaticsData() {

    const credentials = JSON.parse(await SM.getSecretString(API_CREDENTIALS_SECRET_METEOMATICS) as string);

    const authHeader = {
        'Authorization': 'Basic ' + Buffer.from(credentials.username + ":" + credentials.password).toString('base64')
    };

    const authObject = JSON.parse(await httpsGet('https://login.meteomatics.com/api/v1/token', undefined, 3, authHeader));

    const now = Date.now();
    const start = moment(now).startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const end = moment(now).add(8, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');

    // https://api.meteomatics.com/2022-11-04T00:00:00Z--2022-11-12T00:00:00Z:PT1H/wind_speed_10m:mph,wind_gusts_10m_1h:mph,wind_dir_10m:d,t_2m:F,precip_1h:mm/47.806994,-122.192443/json?accessToken=
    const url = `https://api.meteomatics.com/${start}--${end}:PT1H/wind_speed_10m:mph,wind_gusts_10m_1h:mph,wind_dir_10m:d,t_2m:F,precip_1h:mm/${LATITUDE},${LONGITUDE}/json?access_token=${authObject.access_token}`;

    const data = await httpsGet(url);
    try {
        const weatherData: MeteomaticsData = JSON.parse(data);
        return weatherData;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

export async function getAsCommonData() {
    const data = await getMeteomaticsData();
    const hourlyData = getIntermediateHourlyData(data);

    const commonData = {
        hourly: [] as any, // Empty array, will fill this in
        daily: [] as any, // Empty array, will fill this in
    }

    let currentDay;
    let currentDayTimestamp: number;
    let dailyMaxTemp = -999; // max
    let dailyMinTemp = 999; // min
    let dailyRain = 0; // sum
    let dailyWindSpeed = 0; // max
    let dailyWindVectors: AngleAndSpeed[] = []; // avg
    let dailyWindGust = 0; // max

    for (let isoDateTime of Object.keys(hourlyData)) {
        const dataPoint = hourlyData[isoDateTime];
        const epochMillis = moment(isoDateTime).valueOf();
        const day = toReadablePacificDate(epochMillis, Format.DATE_ONLY);
        if (day !== currentDay) {
            if (currentDay != null) {

                commonData.daily.push({
                    datetime: getStartOfDay(currentDayTimestamp!) / 1000, // Don't need millis
                    temp: {
                        min: dailyMinTemp,
                        max: dailyMaxTemp
                    },
                    rain: dailyRain,
                    wind_speed: dailyWindSpeed,
                    wind_deg: averageAngle(dailyWindVectors),
                    wind_gust: dailyWindGust
                });


                dailyMaxTemp = 0; // max
                dailyMinTemp = 999; // min
                dailyRain = 0; // sum
                dailyWindSpeed = 0; // max
                dailyWindVectors = []; // avg
                dailyWindGust = 0; // max
            }
            currentDay = day;
            currentDayTimestamp = epochMillis;
        }


        dailyMaxTemp = Math.max(dailyMaxTemp, dataPoint.temp || 0);
        dailyMinTemp = Math.min(dailyMinTemp, dataPoint.temp || 999);
        dailyRain += dataPoint.precip || 0;
        dailyWindSpeed = Math.max(dailyWindSpeed, dataPoint.windSpeed || 0);
        if (dataPoint.windDir) {
            dailyWindVectors.push({
                angle: dataPoint.windDir,
                speed: dataPoint.windSpeed
            });
        }
        dailyWindGust = Math.max(dailyWindGust, dataPoint.windGust || 0);

        // Take of hourly
        commonData.hourly.push({
            datetime: epochMillis / 1000, // Don't need millis
            wind_speed: dataPoint.windSpeed,
            wind_deg: dataPoint.windDir,
            wind_gust: dataPoint.windGust,
            temp: dataPoint.temp,
            rain: dataPoint.precip
        });
    }

    return commonData as unknown as WeatherData;
}

function getIntermediateHourlyData(data: MeteomaticsData) {

    const intermediateHourlyData: { [key: string]: IntermediateHourlyData } = {};

    for (let dataSet of data.data) {

        const parameter = dataSet.parameter;
        const coordinateCount = dataSet.coordinates?.length || 999;

        if (coordinateCount !== 1) {
            throw Error("Unexpected number of coordinates: " + coordinateCount);
        }

        for (const hourlyData of dataSet.coordinates[0].dates) {
            const isoDateTimeString = hourlyData.date;

            const tempData = intermediateHourlyData[isoDateTimeString] || {
                isoDateTimeString: isoDateTimeString
            };

            // wind_speed_10m:mph - wind speed in mph
            // wind_gusts_10m_1h:mph - wind gust speed in mph
            // wind_dir_10m:d - wind degrees
            // t_2m:F - temperature in F
            // precip_1h:mm - rain in mm
            if (parameter === 'wind_speed_10m:mph') {
                tempData.windSpeed = hourlyData.value;
            } else if (parameter === 'wind_gusts_10m_1h:mph') {
                tempData.windGust = hourlyData.value;
            } else if (parameter === 'wind_dir_10m:d') {
                tempData.windDir = hourlyData.value;
            } else if (parameter === 't_2m:F') {
                tempData.temp = hourlyData.value;
            } else if (parameter === 'precip_1h:mm') {
                tempData.precip = mmToIn(hourlyData.value);
            } else {
                throw Error("Unexpected parameter: " + parameter);
            }
            intermediateHourlyData[isoDateTimeString] = tempData;
        }
    }

    // console.log(JSON.stringify(intermediateHourlyData, null, 2));

    return intermediateHourlyData;
}

interface IntermediateHourlyData {
    isoDateTimeString: string,
    windSpeed?: number,
    windGust?: number,
    windDir?: number,
    temp?: number,
    precip?: number
}

