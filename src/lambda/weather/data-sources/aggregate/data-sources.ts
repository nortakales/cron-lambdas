import { WeatherData } from "../common/common-data";
import * as openweather from "../openweather/openweather-api";
import * as weathergov from "../weathergov/weathergov-api";
import * as tomorrowio from "../tomorrowio/tomorrowio-api";
import * as visualcrossing from "../visualcrossing/visualcrossing-api";
import * as meteomatics from "../meteomatics/meteomatics-api";
import * as openmeteo from "../openmeteo/openmeteo-api";
import * as accuweather from "../accuweather/accuweather-api";
import * as nwsalerts from "../weathergov/nws-alerts-api";
import * as pirateweather from "../pirateweather/pirateweather-api";
import * as googleweather from "../googleweather/googleweather-api";

export interface DataSource {
    readonly fullName: string,
    readonly shortCode: string,
    getData(): Promise<WeatherData>,
    readonly enabled: boolean
}

export const dataSources: DataSource[] = [
    {
        fullName: "OpenWeather",
        shortCode: "ow",
        getData: async function () {
            return await openweather.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "Weather.gov",
        shortCode: "wg",
        getData: async function () {
            return await weathergov.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "TomorrowIO",
        shortCode: "ti",
        getData: async function () {
            return await tomorrowio.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "VisualCrossing",
        shortCode: "vc",
        getData: async function () {
            return await visualcrossing.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "Meteomatics",
        shortCode: "mm",
        getData: async function () {
            return await meteomatics.getAsCommonData();
        },
        enabled: false // No more free plan
    },
    {
        fullName: "OpenMeteo", // best_match, which here is HRRR for ~48 hours then GFS
        shortCode: "om",
        getData: async function () {
            return await openmeteo.getAsCommonData();
        },
        enabled: true
    },
    // Individual models via Open-Meteo, each counted as its own source. Only models that are distinct from
    // best_match (HRRR/GFS) and actually cover this location (European regional models like KNMI/DMI/MET
    // Norway just fall back to ECMWF here). See docs/weather-alert-system.md.
    {
        fullName: "OpenMeteo ECMWF IFS",
        shortCode: "ec",
        getData: async function () {
            return await openmeteo.getAsCommonData('ecmwf_ifs');
        },
        enabled: true
    },
    {
        fullName: "OpenMeteo NBM",
        shortCode: "nb",
        getData: async function () {
            return await openmeteo.getAsCommonData('ncep_nbm_conus');
        },
        enabled: true
    },
    {
        fullName: "OpenMeteo GEM",
        shortCode: "gm",
        getData: async function () {
            return await openmeteo.getAsCommonData('gem_seamless');
        },
        enabled: true
    },
    {
        fullName: "OpenMeteo ICON",
        shortCode: "ic",
        getData: async function () {
            return await openmeteo.getAsCommonData('icon_seamless');
        },
        enabled: true
    },
    {
        fullName: "OpenMeteo UKMO",
        shortCode: "uk",
        getData: async function () {
            return await openmeteo.getAsCommonData('ukmo_seamless');
        },
        enabled: true
    },
    {
        fullName: "AccuWeather",
        shortCode: "aw",
        getData: async function () {
            return await accuweather.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "PirateWeather", // Free: 10,000 calls/month, 1 per run
        shortCode: "pw",
        getData: async function () {
            return await pirateweather.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "GoogleWeather", // Free: 10,000 calls/month, 4 per run (daily quota capped in GCP)
        shortCode: "gw",
        getData: async function () {
            return await googleweather.getAsCommonData();
        },
        enabled: true
    },
    {
        fullName: "NWS Alerts", // Official alerts only, no forecast data
        shortCode: "na",
        getData: async function () {
            return await nwsalerts.getAsCommonData();
        },
        enabled: true
    },
];
