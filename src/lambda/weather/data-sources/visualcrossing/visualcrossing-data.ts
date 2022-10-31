export interface VisualCrossingData {
    columns: any,
    remainingCost: number,
    queryCost: number,
    messages: any,
    location: LocationData
}

export interface LocationData {
    stationContributions: any,
    id: string,
    address: string,
    latitude: number,
    longitude: number,
    alerts: any,
    values: HourlyValues[]
}

// https://www.visualcrossing.com/resources/documentation/weather-data/weather-data-documentation/
export interface HourlyValues {
    datetimeStr: string, // 2021-11-27T13:00:00-08:00
    //datetime: number, // millis, 1638018000000

    preciptype: string // rain, snow, freezing rain, ice, (can be empty)
    pop: number, // % 0 to 100
    precip: number, // actual amount in inches
    snow: number, // inches

    wspd: number, // mph
    wgust: number, // mph
    wdir: number, // wind direction

    temp: number, // F

    cloudcover: number, // % 0 to 100

    humidity: number, // % 0 to 100
    heatindex: number, // F
    windchill: number, // F
    dew: number, // F
    uvindex: number,
    visibility: number, // miles, 15 appears to be the max
    sealevelpressure: number // millibars
}