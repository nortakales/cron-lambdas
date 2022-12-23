import * as SM from '../../../secrets';
import { httpsGet } from '../../../http';
import { AccuWeatherData, DailyAccuWeatherData, HourlyAccuWeatherData } from './accuweather-data';
import { DailyConditions, HourlyConditions, WeatherData } from '../common/common-data';
import { averageAngle, getStartOfDay } from '../../utilities';

const API_KEY_ACCUWEATHER = process.env.API_KEY_ACCUWEATHER!;
const API_KEY_ACCUWEATHER_ALTERNATE = process.env.API_KEY_ACCUWEATHER_ALTERNATE!;

export async function getAccuWeatherData() {

    const apiKey = await SM.getSecretString(API_KEY_ACCUWEATHER);
    const apiKey2 = await SM.getSecretString(API_KEY_ACCUWEATHER_ALTERNATE);

    // TODO Check that the locationKey hasn't changed every so often
    // const locationUrl = `https://dataservice.accuweather.com/locations/v1/postalcodes/US/search?apikey=${apiKey}&q=98021`;
    // const locationJson = await httpsGet(locationUrl);
    // const locationData = JSON.parse(locationJson);
    // const locationKey = locationData[0].Key;
    const locationKey = '41277_PC';

    const hourlyUrl = `https://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${locationKey}?apikey=${apiKey}&details=true`;
    const dailyUrl = `https://dataservice.accuweather.com/forecasts/v1/daily/5day/${locationKey}?apikey=${apiKey2}&details=true`;

    let hourlyData;
    let dailyData;
    try {
        hourlyData = await httpsGet(hourlyUrl);
        dailyData = await httpsGet(dailyUrl);
        const weatherData: AccuWeatherData = {
            hourlyData: JSON.parse(hourlyData),
            dailyData: JSON.parse(dailyData)
        }
        return weatherData;
    } catch (error) {
        console.log(JSON.stringify(error, null, 2));
        console.log("Dumping hourly weather data:");
        console.log(hourlyData);
        console.log("Dumping daily weather data:");
        console.log(dailyData);
        throw error;
    }
}

export async function getAsCommonData() {
    const data = await getAccuWeatherData();

    return {
        hourly: convertToCommonHourly(data.hourlyData),
        daily: convertToCommonDaily(data.dailyData.DailyForecasts)
    } as WeatherData;

}

function convertToCommonHourly(data: HourlyAccuWeatherData[]): HourlyConditions[] {
    const returnData: HourlyConditions[] = [];
    for (let hour of data) {

        if (hour.Temperature.Unit !== 'F' ||
            hour.RealFeelTemperature.Unit !== 'F' ||
            hour.Visibility.Unit !== 'mi' ||
            hour.Rain.Unit !== 'in' ||
            hour.Snow.Unit !== 'in' ||
            hour.DewPoint.Unit !== 'F' ||
            hour.Wind.Speed.Unit !== 'mi/h' ||
            hour.WindGust.Speed.Unit !== 'mi/h') {
            throw Error("Unexpected units for AccuWeather!");
        }
        returnData.push({
            datetime: hour.EpochDateTime,
            temp: hour.Temperature.Value,
            feels_like: hour.RealFeelTemperature.Value,
            visibility: hour.Visibility.Value,
            pop: hour.PrecipitationProbability,
            rain: hour.Rain.Value,
            snow: hour.Snow.Value,
            // pressure: 0,
            humidity: hour.RelativeHumidity,
            dew_point: hour.DewPoint.Value,
            uvi: hour.UVIndex,
            clouds: hour.CloudCover,
            wind_speed: hour.Wind.Speed.Value,
            wind_deg: hour.Wind.Direction.Degrees,
            wind_gust: hour.WindGust.Speed.Value
        } as unknown as HourlyConditions);
    }
    return returnData;
}

function convertToCommonDaily(data: DailyAccuWeatherData[]): DailyConditions[] {
    const returnData: DailyConditions[] = [];
    for (let day of data) {

        if (day.Temperature.Minimum.Unit !== 'F' ||
            day.Temperature.Maximum.Unit !== 'F' ||
            day.Day.Rain.Unit !== 'in' ||
            day.Night.Rain.Unit !== 'in' ||
            day.Day.Wind.Speed.Unit !== 'mi/h' ||
            day.Night.Wind.Speed.Unit !== 'mi/h' ||
            day.Day.WindGust.Speed.Unit !== 'mi/h' ||
            day.Night.WindGust.Speed.Unit !== 'mi/h') {
            throw Error("Unexpected units for AccuWeather!");
        }
        returnData.push({
            datetime: getStartOfDay(day.EpochDate) / 1000,
            temp: {
                min: day.Temperature.Minimum.Value,
                max: day.Temperature.Maximum.Value
            },
            pop: day.Day.PrecipitationProbability,
            rain: day.Day.Rain.Value + day.Night.Rain.Value,
            //pressure: 0,
            //humidity: 0,
            //dew_point: 0,
            //uvi: 0,
            //clouds: 0,
            wind_speed: Math.max(day.Day.Wind.Speed.Value, day.Night.Wind.Speed.Value),
            wind_deg: averageAngle([
                { speed: day.Day.Wind.Speed.Value, angle: day.Day.Wind.Direction.Degrees },
                { speed: day.Night.Wind.Speed.Value, angle: day.Night.Wind.Direction.Degrees }]),
            wind_gust: Math.max(day.Day.WindGust.Speed.Value, day.Night.WindGust.Speed.Value),
        } as DailyConditions);
    }
    return returnData;
}