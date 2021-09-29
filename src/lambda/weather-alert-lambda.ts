
import * as HTTPS from 'https';
import { sendEmail } from './emailer';

const API_KEY = process.env.API_KEY!;
const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;
const ENABLED = process.env.ENABLED!;

async function httpsGet(url: string): Promise<string> {

    console.log("Getting " + url);

    return new Promise(function (resolve, reject) {

        const options = {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };

        var request = HTTPS.get(url, options, (response) => {

            if (response?.statusCode === undefined ||
                response.statusCode < 200 ||
                response.statusCode >= 300) {
                return reject(new Error('statusCode=' + response.statusCode));
            }

            let data = '';

            response.on('data', (chunk) => {
                console.log("Retrieving data");
                data += chunk;
            });

            response.on('end', () => {
                console.log("Ended data transfer");
                resolve(data);
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
            reject(err.message);
        });

        request.end();
    });
}

exports.handler = async (event = {}) => {
    if (ENABLED !== 'true') {
        console.log("Weather Alert is not enabled, exiting...");
        return;
    }

    console.log("Running...");

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${API_KEY}&lang=en&units=imperial`;

    const data = await httpsGet(url);
    const weatherData: WeatherData = JSON.parse(data);

    let alerts = '';

    for (let hourlyData of weatherData.hourly) {
        if (hourlyData.wind_speed > 25 || hourlyData.wind_gust > 25) {
            alerts += new Date(hourlyData.dt * 1000).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + `: wind speed of ${hourlyData.wind_speed} mph and wind gust of ${hourlyData.wind_gust} mph blowing ${getDirectionFromDegrees(hourlyData.wind_deg)}\n`;
        }
    }

    if (alerts === '') {
        alerts = 'No alerts!';
    }

    sendEmail(alerts)

    console.log("Complete");
};




function getDirectionFromDegrees(degrees: number) {
    if (degrees < 0 || degrees > 360)
        return "Invalid direction";
    if (degrees >= 337.5 && degrees < 22.5)
        return "South";
    if (degrees >= 22.5 && degrees < 67.5)
        return "Southwest";
    if (degrees >= 67.5 && degrees < 112.5)
        return "West";
    if (degrees >= 112.5 && degrees < 157.5)
        return "Northwest";
    if (degrees >= 157.5 && degrees < 202.5)
        return "North";
    if (degrees >= 202.5 && degrees < 247.5)
        return "Northeast";
    if (degrees >= 247.5 && degrees < 292.5)
        return "East";
    if (degrees >= 292.5 && degrees < 337.5)
        return "Southeast";
    return "Invalid direction";
}









interface WeatherData {
    lat: number;
    lon: number;
    timezone: string;
    timezone_offset: number;
    current: CurrentConditions;
    minutely: MinutelyConditions[];
    hourly: HourlyConditions[];
    daily: DailyConditions[];
}

interface MinutelyConditions {
    dt: number;
    precipitation: number;
}

interface DailyConditions extends BaseConditions {
    moonrise: number;
    moonset: number;
    moon_phase: number;

    temp: DailyTemperature;
    feels_like: DailyFeelsLike;

    pop: number;
    rain: number;

}
interface DailyFeelsLike {
    morn: number;
    day: number;
    eve: number;
    night: number;
}

interface DailyTemperature {
    min: number;
    max: number;
    morn: number;
    day: number;
    eve: number;
    night: number;
}

interface BaseConditions {
    // datetime epoch in seconds
    dt: number;
    sunrise: number;
    sunset: number;

    pressure: number;
    humidity: number;
    dew_point: number;
    uvi: number;
    clouds: number;

    wind_speed: number;
    wind_deg: number;
    wind_gust: number;

    weather: WeatherType;
}

interface CurrentConditions extends BaseConditions {

    temp: number;
    feels_like: number;

    visibility: number;
}

interface HourlyConditions extends BaseConditions {

    temp: number;
    feels_like: number;


    visibility: number;

    pop: number;
    rain: RainHistogram
}

interface RainHistogram {
    '1h': number;
}

interface WeatherType {
    id: number;
    main: string;
    description: string;
    icon: string;
}

// Uncomment this to call locally
// exports.handler();