export interface WeatherData {
    current: CurrentConditions;
    minutely?: MinutelyConditions[];
    hourly: HourlyConditions[];
    daily: DailyConditions[];
    alerts?: AlertData[];
}

export interface MinutelyConditions {
    datetime: number; // seconds
    precipitation: number; // mm
}

export interface DailyConditions extends BaseConditions {

    sunrise?: number;
    sunset?: number;

    moonrise?: number;
    moonset?: number;
    moon_phase?: number;

    temp: DailyTemperature;
    feels_like?: DailyFeelsLike;

    pop: number; // % 0 to 100, max for the day
    rain: number; // inches, total for the day
    snow?: number; // inches, total for the day
}
export interface DailyFeelsLike {
    morn: number;
    day: number;
    eve: number;
    night: number;
}

export interface DailyTemperature {
    min: number; // F
    max: number; // F
    morn?: number;
    day?: number;
    eve?: number;
    night?: number;
}

export interface BaseConditions {

    datetime: number; // seconds

    pressure: number; // hPa
    humidity: number; // % 0 to 100
    dew_point: number; // F
    uvi: number;
    clouds: number; // % 0 to 100

    wind_speed: number; // mph
    wind_deg: number; // angle
    wind_gust: number; // mph

}

export interface CurrentConditions extends BaseConditions {

    temp: number; // F
    feels_like: number; // F

    visibility: number; // miles
}

export interface HourlyConditions extends BaseConditions {

    temp: number; // F
    feels_like: number; // F

    visibility: number; // miles

    pop: number; // % 0 to 100
    rain: number // inches
    snow: number // inches
}

export interface AlertData {
    sender_name: string;
    event: string;
    start: number; // seconds
    end: number; // seconds
    description: string;
    tags: string[];
}