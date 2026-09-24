import { httpsGet } from '../../../http';
import { AlertData, WeatherData } from '../common/common-data';

const LATITUDE = process.env.LATITUDE!;
const LONGITUDE = process.env.LONGITUDE!;

// Official NWS watches/warnings/advisories for the exact location. Free, no key.
// Reference: https://www.weather.gov/documentation/services-web-api#/default/alerts_active

interface NwsAlertsResponse {
    features: {
        properties: {
            event: string, // e.g. "Wind Advisory"
            senderName: string, // e.g. "NWS Seattle WA"
            effective: string, // ISO 8601, when the message was issued/effective
            onset: string | null, // ISO 8601, when the hazard begins
            expires: string, // ISO 8601, when this message expires (may be before the hazard ends)
            ends: string | null, // ISO 8601, when the hazard ends
            severity: string, // Extreme, Severe, Moderate, Minor, Unknown
            certainty: string,
            urgency: string,
            description: string,
            status: string, // Actual, Exercise, System, Test, Draft
            messageType: string // Alert, Update, Cancel
        }
    }[]
}

export async function getNwsAlertsData() {
    // /points and /alerts only accept 4 decimal places, anything more gets a 301 redirect
    const point = `${(+LATITUDE).toFixed(4)},${(+LONGITUDE).toFixed(4)}`;
    const url = `https://api.weather.gov/alerts/active?point=${point}&status=actual`;
    const userAgent = '(Custom Weather App, nortakales@gmail.com)';

    const data = await httpsGet(url, {
        userAgent,
        headers: { 'Accept': 'application/geo+json' }
    });

    try {
        const alertsData: NwsAlertsResponse = JSON.parse(data);
        return alertsData;
    } catch (error) {
        console.log("ERROR parsing weather data! Dumping payload:");
        console.log(data);
        console.log(error);
        throw error;
    }
}

function toEpochSeconds(isoDateTime: string) {
    return Math.floor(new Date(isoDateTime).getTime() / 1000);
}

// Alerts only, there is no forecast data from this source
export async function getAsCommonData() {
    const data = await getNwsAlertsData();

    const alerts: AlertData[] = data.features
        .map(feature => feature.properties)
        .filter(alert => alert.messageType !== 'Cancel')
        .map(alert => ({
            sender_name: alert.senderName,
            event: alert.event,
            start: toEpochSeconds(alert.onset || alert.effective),
            end: toEpochSeconds(alert.ends || alert.expires),
            description: alert.description,
            tags: [alert.severity]
        }));

    return {
        hourly: [],
        daily: [],
        alerts
    } as unknown as WeatherData;
}
