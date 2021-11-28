

import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { CurrentConditions, DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { AngleAndSpeed, averageAngle, Format, removeTimeFromEpochMillisForTimezone, toReadablePacificDate } from '../../utilities';
import queryString from 'query-string';
import { VisualCrossingData } from './visualcrossing-data';

const API_KEY_SECRET_VISUAL_CROSSING = process.env.API_KEY_SECRET_VISUAL_CROSSING!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Reference: https://www.visualcrossing.com/resources/documentation/weather-api/weather-api-documentation/

// https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/38.9697,-77.385?key=YOUR_API_KEY

// https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/forecast?aggregateHours=1&combinationMethod=aggregate&contentType=json&unitGroup=us&locationMode=single&key=<key>&dataElements=default&locations=47.806994,-122.192443

// set the Timelines GET endpoint as the target URL
const forecastUrl = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/forecast";

export async function getVisualCrossingData() {

    const key = await SM.getSecretString(API_KEY_SECRET_VISUAL_CROSSING);
    const locations = `${LATITUDE},${LONGITUDE}`;
    //const dataElements = 'default';
    const locationMode = 'single';
    const unitGroup = "us";
    const contentType = 'json';
    const combinationMethod = 'aggregate';
    const aggregateHours = 1;
    const alertLevel = 'detail';

    const queryStringParams = queryString.stringify({
        key,
        locations,
        //dataElements,
        locationMode,
        unitGroup,
        contentType,
        combinationMethod,
        aggregateHours,
        alertLevel
    }, {
        arrayFormat: "comma"
    });


    let data;
    try {
        data = await httpsGet(forecastUrl + "?" + queryStringParams);
        const weatherData: VisualCrossingData = JSON.parse(data);
        // console.log(JSON.stringify(weatherData, null, 2));
        return weatherData;
    } catch (error) {
        console.log(JSON.stringify(error, null, 2));
        console.log("Dumping weather data:");
        console.log(data);
        throw error;
    }
}

export async function getAsCommonData() {

    let data = await getVisualCrossingData();


    const commonData = {
        hourly: [] as any, // Empty array, will fill this in
        daily: [] as any, // Empty array, will fill this in
    }

    let currentDay;
    let currentDayTimestamp: number;
    let dailyMaxTemp = 0; // max
    let dailyMinTemp = 999; // min
    let dailyPop = 0; // max
    let dailyRain = 0; // sum
    let dailySnow = 0; // sum
    let dailyWindSpeed = 0; // max
    let dailyWindVectors: AngleAndSpeed[] = []; // avg
    let dailyWindGust = 0; // max

    for (let hourlyData of data.location.values) {

        const day = toReadablePacificDate(hourlyData.datetime, Format.DATE_ONLY);
        if (day !== currentDay) {
            if (currentDay != null) {

                commonData.daily.push({
                    datetime: removeTimeFromEpochMillisForTimezone(currentDayTimestamp!),
                    temp: {
                        min: dailyMinTemp,
                        max: dailyMaxTemp
                    },
                    pop: dailyPop,
                    rain: dailyRain,
                    snow: dailySnow,
                    wind_speed: dailyWindSpeed,
                    wind_deg: averageAngle(dailyWindVectors),
                    wind_gust: dailyWindGust
                });


                dailyMaxTemp = 0; // max
                dailyMinTemp = 999; // min
                dailyPop = 0; // max
                dailyRain = 0; // sum
                dailySnow = 0; // sum
                dailyWindSpeed = 0; // max
                dailyWindVectors = []; // avg
                dailyWindGust = 0; // max
            }
            currentDay = day;
            currentDayTimestamp = hourlyData.datetime;
        }


        dailyMaxTemp = Math.max(dailyMaxTemp, hourlyData.temp || 0);
        dailyMinTemp = Math.min(dailyMinTemp, hourlyData.temp || 0);
        dailyPop = Math.max(dailyPop, hourlyData.pop || 0);
        dailyRain += hourlyData.precip || 0;
        dailySnow += hourlyData.snow || 0;
        dailyWindSpeed = Math.max(dailyWindSpeed, hourlyData.wspd || 0);
        if (hourlyData.wdir) {
            dailyWindVectors.push({
                angle: hourlyData.wdir,
                speed: hourlyData.wspd
            });
        }
        dailyWindGust = Math.max(dailyWindGust, hourlyData.wgust || 0);

        // Take of hourly
        commonData.hourly.push({
            datetime: hourlyData.datetime / 1000, // Don't need millis
            wind_speed: hourlyData.wspd,
            wind_deg: hourlyData.wdir,
            wind_gust: hourlyData.wgust,
            temp: hourlyData.temp,
            pop: hourlyData.pop,
            rain: hourlyData.precip,
            snow: hourlyData.snow
        });

    }

    return commonData as unknown as WeatherData;
}

