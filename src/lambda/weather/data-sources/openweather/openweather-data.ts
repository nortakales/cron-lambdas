export interface OpenWeatherData {
    lat: number;
    lon: number;
    timezone: string;
    timezone_offset: number;
    current: CurrentConditions;
    minutely: MinutelyConditions[];
    hourly: HourlyConditions[];
    daily: DailyConditions[];
    alerts: AlertData[];
}

export interface MinutelyConditions {
    dt: number; // seconds
    precipitation: number; // mm
}

export interface DailyConditions extends BaseConditions {
    moonrise: number;
    moonset: number;
    moon_phase: number;

    temp: DailyTemperature; // F
    feels_like: DailyFeelsLike; // F

    pop: number; // % 0 to 1.0
    rain: number; // mm
    snow: number; // mm
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
    morn: number;
    day: number;
    eve: number;
    night: number;
}

export interface BaseConditions {
    dt: number; // seconds
    sunrise: number;
    sunset: number;

    pressure: number; // hPa
    humidity: number; // % 0 to 100
    dew_point: number; // F
    uvi: number;
    clouds: number; // % 0 to 100

    wind_speed: number; // mph
    wind_deg: number; // angle
    wind_gust: number; // mph

    weather: WeatherType;
}

export interface CurrentConditions extends BaseConditions {

    temp: number; // F
    feels_like: number; // F

    visibility: number; // meters
}

export interface HourlyConditions extends BaseConditions {

    temp: number; // F
    feels_like: number; // F

    visibility: number; // meters

    pop: number; // % 0 to 1
    rain: PrecipitationHistogram
    snow: PrecipitationHistogram
}

export interface PrecipitationHistogram {
    '1h': number; // mm for the previous hour
}

export interface WeatherType {
    id: number;
    main: string;
    description: string;
    icon: string;
}

export interface AlertData {
    sender_name: string;
    event: string;
    start: number;
    end: number;
    description: string;
    tags: string[];
}