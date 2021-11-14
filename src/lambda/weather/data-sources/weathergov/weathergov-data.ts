export interface WeatherGovData {
    properties: WeatherGovProperties
}

export interface WeatherGovProperties {
    updateTime: string,
    validTimes: string,

    temperature: WeatherGovProperty,
    maxTemperature: WeatherGovProperty,
    minTemperature: WeatherGovProperty,
    apparentTemperature: WeatherGovProperty,
    windChill: WeatherGovProperty,
    dewpoint: WeatherGovProperty,
    relativeHumidity: WeatherGovProperty,
    skyCover: WeatherGovProperty,
    windDirection: WeatherGovProperty,
    windSpeed: WeatherGovProperty,
    windGust: WeatherGovProperty,
    probabilityOfPrecipitation: WeatherGovProperty,
    quantitativePrecipitation: WeatherGovProperty,
    snowfallAmount: WeatherGovProperty
}

export interface WeatherGovProperty {
    uom: string,
    values: WeatherGovPropertyValue[]
}

export interface WeatherGovPropertyValue {
    validTime: string,
    value: number
}