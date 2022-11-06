export interface MeteomaticsData {
    version: string,
    dateGenerated: string,
    status: string,
    data: MeteomaticsDataSet[]
}

export interface MeteomaticsDataSet {
    parameter: string,
    coordinates: MeteomaticsDataForCoordinates[]
}

export interface MeteomaticsDataForCoordinates {
    lat: number,
    lon: number,
    dates: MeteomaticsDataPoint[]
}

export interface MeteomaticsDataPoint {
    date: string,
    value: number
}