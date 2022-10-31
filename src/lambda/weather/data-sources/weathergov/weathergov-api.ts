import { httpsGet } from '../../../http';
import { cToF, kmhToMph, mmToIn } from '../../conversions';
import { AngleAndSpeed, averageAngle, Format, getStartOfDay, toReadablePacificDate } from '../../utilities';
import { WeatherData } from '../common/common-data';
import { WeatherGovData, WeatherGovProperty } from './weathergov-data';


export async function getOpenWeatherData() {

    const url = `https://api.weather.gov/gridpoints/SEW/130,76`;
    const userAgent = '(Custom Weather App, nortakales@gmail.com)';

    let data;
    try {
        data = await httpsGet(url, userAgent);
        const weatherData: WeatherGovData = JSON.parse(data);
        return weatherData;
    } catch (error) {
        console.log(JSON.stringify(error, null, 2));
        console.log("Dumping weather data:");
        console.log(data);
        throw error;
    }
}

export async function getAsCommonData() {
    const data = await getOpenWeatherData();

    const commonData = {
        hourly: [] as any, // Empty array, will fill this in
        daily: [] as any, // Empty array, will fill this in
    }

    const allHourlyData = convertToHourlyData(data);

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

    for (let hourlyData of allHourlyData) {

        const day = toReadablePacificDate(hourlyData.datetime, Format.DATE_ONLY);
        if (day !== currentDay) {
            if (currentDay != null) {

                commonData.daily.push({
                    datetime: getStartOfDay(currentDayTimestamp!) / 1000, // Don't need millis
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


        dailyMaxTemp = Math.max(dailyMaxTemp, hourlyData.temperature || 0);
        dailyMinTemp = Math.min(dailyMinTemp, hourlyData.temperature || 0);
        dailyPop = Math.max(dailyPop, hourlyData.probabilityOfPrecipitation || 0);
        dailyRain += hourlyData.quantitativePrecipitation || 0;
        dailySnow += hourlyData.snowfallAmount || 0;
        dailyWindSpeed = Math.max(dailyWindSpeed, hourlyData.windSpeed || 0);
        if (hourlyData.windDirection) {
            dailyWindVectors.push({
                angle: hourlyData.windDirection,
                speed: hourlyData.windSpeed
            });
        }
        dailyWindGust = Math.max(dailyWindGust, hourlyData.windGust || 0);

        // Take of hourly
        commonData.hourly.push({
            datetime: hourlyData.datetime / 1000, // Don't need millis
            wind_speed: hourlyData.windSpeed,
            wind_deg: hourlyData.windDirection,
            wind_gust: hourlyData.windGust,
            temp: hourlyData.temperature,
            feels_like: hourlyData.apparentTemperature,
            pop: hourlyData.probabilityOfPrecipitation,
            rain: hourlyData.quantitativePrecipitation,
            snow: hourlyData.snowfallAmount
        });

    }

    return commonData as unknown as WeatherData;
}

interface HourlyData {
    datetime: number
    temperature?: number,
    maxTemperature?: number,
    minTemperature?: number,
    apparentTemperature?: number,
    windChill?: number,
    heatIndex?: number,
    dewpoint?: number,
    relativeHumidity?: number,
    skyCover?: number,
    windDirection?: number,
    windSpeed?: number,
    windGust?: number,
    probabilityOfPrecipitation?: number,
    quantitativePrecipitation?: number,
    snowfallAmount?: number,
    iceAccumulation?: number
}

const propertiesThatAreSumsForPeriod = [
    'quantitativePrecipitation',
    'snowfallAmount',
    'iceAccumulation'
]

function convertToHourlyData(weatherData: WeatherGovData) {

    const hourlyDatas: { [key: string]: HourlyData } = {};

    const propertyMap: { [key: string]: WeatherGovProperty } = {
        temperature: weatherData.properties.temperature,
        maxTemperature: weatherData.properties.maxTemperature,
        minTemperature: weatherData.properties.minTemperature,
        apparentTemperature: weatherData.properties.apparentTemperature,
        windChill: weatherData.properties.windChill,
        heatIndex: weatherData.properties.heatIndex,
        dewpoint: weatherData.properties.dewpoint,
        relativeHumidity: weatherData.properties.relativeHumidity,
        skyCover: weatherData.properties.skyCover,
        windDirection: weatherData.properties.windDirection,
        windSpeed: weatherData.properties.windSpeed,
        windGust: weatherData.properties.windGust,
        probabilityOfPrecipitation: weatherData.properties.probabilityOfPrecipitation,
        quantitativePrecipitation: weatherData.properties.quantitativePrecipitation,
        snowfallAmount: weatherData.properties.snowfallAmount,
        iceAccumulation: weatherData.properties.iceAccumulation
    }

    for (let propertyName in propertyMap) {

        const property = propertyMap[propertyName];

        for (let value of property.values) {

            const datetimes = convertTimePeriodToSequenceOfMillis(value.validTime);
            for (let datetime of datetimes) {
                let hourlyData = hourlyDatas[`${datetime}`];
                if (hourlyData == null) {
                    hourlyData = {
                        datetime: datetime
                    }
                    hourlyDatas[`${datetime}`] = hourlyData;
                }
                let hourlyValue = getValueInCorrectUnits(property.uom, value.value);
                if (propertiesThatAreSumsForPeriod.includes(propertyName)) {
                    hourlyValue = hourlyValue / datetimes.length;
                }
                hourlyData[propertyName as keyof HourlyData] = hourlyValue;
            }
        }
    }

    return Object.values(hourlyDatas).sort((first, second) => {
        return first.datetime - second.datetime;
    });
}

// Input format is like:
// 2021-11-14T09:00:00+00:00/P1DT6H
// 2021-11-14T09:00:00+00:00/PT6H
function convertTimePeriodToSequenceOfMillis(timePeriod: string) {
    const dateTime = timePeriod.split('/')[0];
    const period = timePeriod.split('/')[1];
    const numberOfHours = parsePeriodIntoNumberOfHours(period);
    const sequenceOfMillis = [];
    let datetime = new Date(dateTime).getTime();
    for (let hour = 0; hour < numberOfHours; hour++) {
        sequenceOfMillis.push(datetime);
        datetime += (1000 * 60 * 60);
    }
    return sequenceOfMillis;
}

const daysRegex = /P(\d*)D/;
const hoursRegex = /T(\d*)H/;
function parsePeriodIntoNumberOfHours(period: string) {

    let numberOfDays = 0;
    let daysMatch;
    if ((daysMatch = daysRegex.exec(period)) !== null) {
        numberOfDays = +daysMatch[1];
    }

    let numberOfHours = 0;
    let hoursMatch;
    if ((hoursMatch = hoursRegex.exec(period)) !== null) {
        numberOfHours = +hoursMatch[1];
    }

    return numberOfHours + 24 * numberOfDays;
}


function getValueInCorrectUnits(currentUnits: string, value: number) {
    if (currentUnits === 'wmoUnit:degC') {
        return cToF(value);
    }
    if (currentUnits === 'wmoUnit:km_h-1') {
        return kmhToMph(value);
    }
    if (currentUnits === 'wmoUnit:degree_(angle)') {
        return value;
    }
    if (currentUnits === 'wmoUnit:percent') {
        return value;
    }
    if (currentUnits === 'wmoUnit:mm') {
        return mmToIn(value);
    }
    throw new Error("Encountered a unit I wasn't anticipating: " + currentUnits);
}


export async function main() {
    const data = await getOpenWeatherData();
    //console.log(JSON.stringify(data, null, 2));
    //console.log(JSON.stringify(convertToHourlyData(data), null, 2));
    //console.log(JSON.stringify(convertToHourlyData(data).map(entry => { return entry.datetime }), null, 2));

    // console.log(parsePeriodIntoNumberOfHours("P1DT6H"));
    // console.log(parsePeriodIntoNumberOfHours("P1D"));
    // console.log(parsePeriodIntoNumberOfHours("PT6H"));

    // console.log(convertTimePeriodToSequenceOfMillis("2021-11-14T09:00:00+00:00/PT6H"));
    // console.log(convertTimePeriodToSequenceOfMillis("2021-11-14T09:00:00+00:00/P1DT6H"));
    // console.log(convertTimePeriodToSequenceOfMillis("2021-11-14T09:00:00+00:00/P1D"));
}

//main();
