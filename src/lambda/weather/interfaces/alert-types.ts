import { TimeDuration } from "typed-duration";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";
import { WeatherData } from "../data-sources/common/common-data";


export interface Alert {
    interval: TimeDuration
    alertTitle: string;
    alertKey: string;
    process(weatherData: WeatherData, adhoc?: boolean): Promise<AlertData>
    processAggregate(weatherData: AggregatedWeatherData, adhoc?: boolean): Promise<AlertData>
}

export interface AlertData {
    hasAlert: boolean;
    alertMessage?: string;
    notificationType?: NotificationType;
}

export enum NotificationType {
    EMAIL,
    PUSH,
    EMAIL_AND_PUSH
}

export class ReportType {

    readonly name: string;
    readonly isAdhoc: boolean;

    static readonly REGULAR = new ReportType('REGULAR', false);
    static readonly ADHOC = new ReportType('ADHOC', false);
    static readonly ADHOC_AGGREGATE = new ReportType('ADHOC_AGGREGATE', false);

    private constructor(name: string, isAdhoc: boolean) {
        this.name = name;
        this.isAdhoc = isAdhoc;
    }
}