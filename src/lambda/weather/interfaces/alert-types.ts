import { WeatherData } from "./data";
import { TimeDuration } from "typed-duration";


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
