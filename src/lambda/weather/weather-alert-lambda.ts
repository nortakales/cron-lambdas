
import * as HTTPS from 'https';
import { sendEmail } from '../emailer';
import { DailyWindAlert } from './alerts/daily-wind-alert';
import { Alert } from './interfaces/alert-types';
import { WeatherData } from './interfaces/data';

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

const alerts: Alert[] = [
    new DailyWindAlert()
];

exports.handler = async (event = {}) => {
    if (ENABLED !== 'true') {
        console.log("Weather Alert is not enabled, exiting...");
        return;
    }

    console.log("Running...");

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${API_KEY}&lang=en&units=imperial`;

    const data = await httpsGet(url);
    const weatherData: WeatherData = JSON.parse(data);

    let hasAlerts = false;
    let alertBody = '';

    for (let alert of alerts) {
        const alertData = alert.process(weatherData);
        if (alertData.hasAlert) {
            hasAlerts = true;
            alertBody += alertData.alertMessage + '\n\n';
        }
    }

    if (!hasAlerts) {
        alertBody = 'No alerts!';
    }

    await sendEmail(alertBody)

    console.log("Complete");
};



// Uncomment this to call locally
// exports.handler();