export interface WeatherGovData {
    properties: WeatherGovProperties
}

export interface WeatherGovProperties {
    updateTime: string,
    validTimes: string,

    temperature: WeatherGovProperty, // C
    maxTemperature: WeatherGovProperty, // C
    minTemperature: WeatherGovProperty, // C
    apparentTemperature: WeatherGovProperty, // C
    windChill: WeatherGovProperty, // C
    heatIndex: WeatherGovProperty, // C
    dewpoint: WeatherGovProperty, // C
    relativeHumidity: WeatherGovProperty, // % 0 to 100
    skyCover: WeatherGovProperty, // % 0 to 100
    windDirection: WeatherGovProperty, // angle
    windSpeed: WeatherGovProperty, // kmh
    windGust: WeatherGovProperty, // kmh
    probabilityOfPrecipitation: WeatherGovProperty, // % 0 to 100
    quantitativePrecipitation: WeatherGovProperty, // mm TODO: it is not clear if this is the sum for the 6h period or per hour, after looking at data I *think* it is sum
    snowfallAmount: WeatherGovProperty, // mm TODO: it is not clear if this is the sum for the 6h period or per hour, after looking at data I *think* it is sum
    iceAccumulation: WeatherGovProperty, // mm TODO: it is not clear if this is the sum for the 6h period or per hour, after looking at data I *think* it is sum
}

export interface WeatherGovProperty {
    uom: string,
    values: WeatherGovPropertyValue[]
}

export interface WeatherGovPropertyValue {
    validTime: string,
    value: number
}