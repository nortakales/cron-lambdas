export interface TomorrowIOData {
    data: TomorrowIOBaseData
}

export interface TomorrowIOBaseData {
    timelines: Timeline[]
}

export interface Timeline {
    timestep: string,
    startTime: string,
    endTime: string,
    intervals: Interval[]
}

export interface Interval {
    startTime: string,
    values: IntervalValues
}

export interface IntervalValues {
    precipitationProbability: number, // % 0 to 100
    precipitationIntensity: number, // inches per hour
    precipitationType: number, // "N/A" "Rain" "Snow" "Freezing Rain" "Ice Pellets"
    iceAccumulation: number, // inches
    snowAccumulation: number, // inches
    windSpeed: number, // mph
    windGust: number, // mph
    windDirection: number, // degrees
    temperature: number, // F
    temperatureMax: number, // F
    temperatureMin: number, // F
    temperatureApparent: number, // F
    cloudCover: number, // % 0 to 100
    cloudBase: number, // miles
    cloudCeiling: number, // miles
    weatherCode: number,
    humidity: number, // % 0 to 100
    pressureSurfaceLevel: number, // inHg
    dewPoint: number, // F
    uvIndex: number,
    visibility: number // miles
}