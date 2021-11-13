import { TimeDuration } from "typed-duration";
import { WeatherData } from "../data-sources/common/common-data";


export interface Alert {
    interval: TimeDuration
    alertTitle: string;
    alertKey: string;
    process(weatherData: WeatherData, adhoc?: boolean): Promise<AlertData>
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
