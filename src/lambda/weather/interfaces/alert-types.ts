import { TimeDuration } from "typed-duration";
import { AggregatedWeatherData } from "../data-sources/aggregate/aggregate-data";
import { WeatherData } from "../data-sources/common/common-data";


export interface Alert {
    interval: TimeDuration
    alertTitle: string;
    alertKey: string;
    process(weatherData: WeatherData, reportType: ReportType): Promise<AlertData>
    processAggregate(weatherData: AggregatedWeatherData, reportType: ReportType): Promise<AlertData>
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
    readonly dataSourceBreakout: boolean;

    static readonly REGULAR = new ReportType('REGULAR', false, false);
    static readonly ADHOC = new ReportType('ADHOC', false, false);
    static readonly ADHOC_AGGREGATE = new ReportType('ADHOC_AGGREGATE', false, false);
    static readonly ADHOC_AGGREGATE_BREAKOUT = new ReportType('ADHOC_AGGREGATE_BREAKOUT', false, true);

    private constructor(name: string, isAdhoc: boolean, dataSourceBreakout: boolean) {
        this.name = name;
        this.isAdhoc = isAdhoc;
        this.dataSourceBreakout = dataSourceBreakout;
    }
}