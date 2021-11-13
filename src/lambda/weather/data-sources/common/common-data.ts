export interface WeatherData {
    current: CurrentConditions;
    minutely: MinutelyConditions[];
    hourly: HourlyConditions[];
    daily: DailyConditions[];
    alerts: AlertData[];
}

export interface MinutelyConditions {
    datetime: number;
    precipitation: number;
}

export interface DailyConditions extends BaseConditions {

    sunrise: number;
    sunset: number;

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
    datetime: number;

    pressure: number;
    humidity: number;
    dew_point: number;
    uvi: number;
    clouds: number;

    wind_speed: number;
    wind_deg: number;
    wind_gust: number;

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
    rain: number
}

export interface AlertData {
    sender_name: string;
    event: string;
    start: number;
    end: number;
    description: string;
    tags: string[];
}