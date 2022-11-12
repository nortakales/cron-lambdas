export interface OpenMeteoData {
    latitude: number;
    longitude: number;
    generationtime_ms: number;
    utc_offset_seconds: number;
    timezone: string;
    timezone_abbreviation: string;
    elevation: number;
    hourly_units: { [key: string]: string };
    hourly: HourlyData;
    daily_units: { [key: string]: string };
    daily: DailyData;
}

export interface HourlyData {
    time: string[];
    temperature_2m: number[];
    relativehumidity_2m: number[];
    precipitation: number[];
    rain: number[];
    showers: number[];
    snowfall: number[];
    snow_depth: number[];
    windspeed_10m: number[];
    winddirection_10m: number[];
    windgusts_10m: number[];
}

export interface DailyData {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    rain_sum: number[];
    showers_sum: number[];
    snowfall_sum: number[];
    windspeed_10m_max: number[];
    windgusts_10m_max: number[];
    winddirection_10m_dominant: number[];
}