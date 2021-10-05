import { WeatherData } from "./data";

export interface Alert {
    frequency: AlertFrequency
    alertTitle: string;
    alertKey: string;
    process(weatherData: WeatherData): AlertData
}

export interface AlertData {
    hasAlert: boolean;
    alertMessage?: string;
    notificationType?: NotificationType;
}

export enum AlertFrequency {
    HOURLY,
    BIDAILY,
    DAILY,
}

export enum NotificationType {
    EMAIL,
    PUSH,
    EMAIL_AND_PUSH
}
