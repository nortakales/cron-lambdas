// Units assume unitsSystem=IMPERIAL. Fields are optional because Google omits some for some hours/days.

export interface GoogleTemperature {
    unit: string; // FAHRENHEIT
    degrees: number;
}

export interface GoogleWind {
    direction?: { degrees: number, cardinal: string }; // direction the wind comes from
    speed?: { unit: string, value: number }; // MILES_PER_HOUR
    gust?: { unit: string, value: number }; // MILES_PER_HOUR
}

export interface GooglePrecipitation {
    probability?: { type: string, percent: number };
    qpf?: { unit: string, quantity: number }; // INCHES, all precipitation (liquid equivalent)
    snowQpf?: { unit: string, quantity: number }; // INCHES of snow
}

export interface GoogleWeatherHour {
    interval: { startTime: string, endTime: string }; // ISO 8601, UTC
    temperature?: GoogleTemperature;
    feelsLikeTemperature?: GoogleTemperature;
    dewPoint?: GoogleTemperature;
    precipitation?: GooglePrecipitation;
    airPressure?: { meanSeaLevelMillibars: number };
    wind?: GoogleWind;
    visibility?: { unit: string, distance: number }; // MILES
    relativeHumidity?: number; // % 0 to 100
    uvIndex?: number;
    cloudCover?: number; // % 0 to 100
}

export interface GoogleWeatherHourlyResponse {
    forecastHours?: GoogleWeatherHour[];
    nextPageToken?: string;
}

export interface GoogleWeatherDayPart {
    interval: { startTime: string, endTime: string };
    precipitation?: GooglePrecipitation;
    wind?: GoogleWind;
    relativeHumidity?: number;
    uvIndex?: number;
    cloudCover?: number;
}

export interface GoogleWeatherDay {
    interval: { startTime: string, endTime: string }; // 7 AM to 7 AM local
    displayDate: { year: number, month: number, day: number };
    daytimeForecast?: GoogleWeatherDayPart;
    nighttimeForecast?: GoogleWeatherDayPart;
    maxTemperature?: GoogleTemperature;
    minTemperature?: GoogleTemperature;
}

export interface GoogleWeatherDailyResponse {
    forecastDays?: GoogleWeatherDay[];
    nextPageToken?: string;
}
