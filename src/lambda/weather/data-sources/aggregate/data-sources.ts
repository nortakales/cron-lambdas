import { WeatherData } from "../common/common-data";
import * as openweather from "../openweather/openweather-api";
import * as weathergov from "../weathergov/weathergov-api";
import * as tomorrowio from "../tomorrowio/tomorrowio-api";
import * as visualcrossing from "../visualcrossing/visualcrossing-api";
import * as meteomatics from "../meteomatics/meteomatics-api";
import * as openmeteo from "../openmeteo/openmeteo-api";
import * as accuweather from "../accuweather/accuweather-api";

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
        enabled: true
    },
    {
        fullName: "OpenMeteo",
        shortCode: "om",
        getData: async function () {
            return await openmeteo.getAsCommonData();
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
];