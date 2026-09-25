// Units assume units=us. All times are epoch seconds.
export interface PirateWeatherData {
    latitude: number;
    longitude: number;
    timezone: string;
    minutely?: { data: PirateWeatherMinutely[] };
    hourly: { data: PirateWeatherHourly[] };
    daily: { data: PirateWeatherDaily[] };
    alerts?: PirateWeatherAlert[];
    flags: {
        units: string;
        version: string;
        sources: string[];
    };
}

export interface PirateWeatherMinutely {
    time: number;
    precipIntensity: number; // in/hr
    precipProbability: number; // 0 to 1
    precipType: string;
}

export interface PirateWeatherHourly {
    time: number;
    icon: string; // icon=pirate set, e.g. "mostly-clear-day", "light-rain"
    temperature: number; // F
    apparentTemperature: number; // F
    dewPoint: number; // F
    humidity: number; // 0 to 1
    pressure: number; // hPa
    windSpeed: number; // mph
    windGust: number; // mph
    windBearing: number; // degrees, direction the wind comes from
    cloudCover: number; // 0 to 1
    uvIndex: number;
    visibility: number; // miles
    precipIntensity: number; // in/hr
    precipProbability: number; // 0 to 1
    precipType: string;
    precipAccumulation: number; // inches, all precipitation types
    liquidAccumulation: number; // inches of rain
    snowAccumulation: number; // inches of snow
    iceAccumulation: number; // inches
}

export interface PirateWeatherDaily {
    time: number; // local midnight
    icon: string; // icon=pirate set
    sunriseTime: number;
    sunsetTime: number;
    moonPhase: number;
    temperatureMax: number; // F, midnight to midnight
    temperatureMin: number; // F, midnight to midnight
    temperatureHigh: number; // F, daytime high
    temperatureLow: number; // F, overnight low
    dewPoint: number;
    humidity: number; // 0 to 1
    pressure: number; // hPa
    windSpeed: number; // mph, daily AVERAGE (not max)
    windGust: number; // mph, daily AVERAGE (not max)
    windBearing: number; // degrees
    cloudCover: number; // 0 to 1
    uvIndex: number;
    visibility: number; // miles
    precipProbability: number; // 0 to 1
    precipType: string;
    precipAccumulation: number; // inches, all precipitation types
    liquidAccumulation: number; // inches of rain
    snowAccumulation: number; // inches of snow
    iceAccumulation: number; // inches
}

export interface PirateWeatherAlert {
    title: string; // e.g. "Wind Advisory"
    regions: string[];
    severity: string;
    time: number; // issued
    expires: number;
    description: string;
    uri: string;
}
