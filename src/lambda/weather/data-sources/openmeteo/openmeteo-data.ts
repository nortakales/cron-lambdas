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

// Values can be null past the end of a model's forecast range
export interface HourlyData {
    time: string[];
    temperature_2m: number[]; // F
    apparent_temperature: number[]; // F
    relative_humidity_2m: number[]; // % 0 to 100
    precipitation_probability: number[]; // % 0 to 100
    precipitation: number[]; // inches, preceding hour, all precipitation types (liquid equivalent)
    snowfall: number[]; // inches of snow, preceding hour
    wind_speed_10m: number[]; // mph
    wind_direction_10m: number[]; // degrees
    wind_gusts_10m: number[]; // mph
}

export interface DailyData {
    time: string[];
    temperature_2m_max: number[]; // F
    temperature_2m_min: number[]; // F
    precipitation_probability_max: number[]; // % 0 to 100
    precipitation_sum: number[]; // inches
    snowfall_sum: number[]; // inches
    wind_speed_10m_max: number[]; // mph
    wind_gusts_10m_max: number[]; // mph
    wind_direction_10m_dominant: number[]; // degrees
}
