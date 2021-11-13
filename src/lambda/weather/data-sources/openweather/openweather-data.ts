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
    dt: number;
    precipitation: number;
}

export interface DailyConditions extends BaseConditions {
    moonrise: number;
    moonset: number;
    moon_phase: number;

    temp: DailyTemperature;
    feels_like: DailyFeelsLike;

    pop: number;
    rain: number;
    snow: number;
}
export interface DailyFeelsLike {
    morn: number;
    day: number;
    eve: number;
    night: number;
}

export interface DailyTemperature {
    min: number;
    max: number;
    morn: number;
    day: number;
    eve: number;
    night: number;
}

export interface BaseConditions {
    // datetime epoch in seconds
    dt: number;
    sunrise: number;
    sunset: number;

    pressure: number;
    humidity: number;
    dew_point: number;
    uvi: number;
    clouds: number;

    wind_speed: number;
    wind_deg: number;
    wind_gust: number;

    weather: WeatherType;
}

export interface CurrentConditions extends BaseConditions {

    temp: number;
    feels_like: number;

    visibility: number;
}

export interface HourlyConditions extends BaseConditions {

    temp: number;
    feels_like: number;


    visibility: number;

    pop: number;
    rain: RainHistogram
}

export interface RainHistogram {
    '1h': number;
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