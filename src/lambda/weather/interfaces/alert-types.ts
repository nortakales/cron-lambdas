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
    readonly isAggregate: boolean;
    readonly dataSourceBreakout: boolean;

    static readonly REGULAR = new ReportType('REGULAR', false, false, false);
    static readonly REGULAR_AGGREGATE = new ReportType('REGULAR_AGGREGATE', false, true, false);
    static readonly ADHOC = new ReportType('ADHOC', true, false, false);
    static readonly ADHOC_AGGREGATE = new ReportType('ADHOC_AGGREGATE', true, true, false);
    static readonly ADHOC_AGGREGATE_BREAKOUT = new ReportType('ADHOC_AGGREGATE_BREAKOUT', true, true, true);

    private constructor(name: string, isAdhoc: boolean, isAggregate: boolean, dataSourceBreakout: boolean) {
        this.name = name;
        this.isAdhoc = isAdhoc;
        this.isAggregate = isAggregate;
        this.dataSourceBreakout = dataSourceBreakout;
    }
}