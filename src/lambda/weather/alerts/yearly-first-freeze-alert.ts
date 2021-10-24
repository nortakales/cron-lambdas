import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import { WeatherData } from "../interfaces/data";
import * as DDB from '../../dynamo';
import { toIsoString, toReadablePacificDate } from "../utilities";

const TABLE_NAME = process.env.TABLE_NAME!;

export class YearlyFirstFreezeAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "Yearly First Freeze Alert";
    alertKey = "yearly-first-freeze-alert";

    private readonly freezeThreshold = 34;

    async process(weatherData: WeatherData) {

        console.log("Running " + this.alertTitle);

        const shouldNotifyForThisSeason = await this.shouldNotifyForThisSeason();
        if (!shouldNotifyForThisSeason) {
            console.log('Already alerted about freezing temps for the current season');
            return {
                hasAlert: false
            }
        }

        let hasAlert = false;
        let message = '';

        for (let dailyData of weatherData.daily) {
            if (dailyData.temp.min <= this.freezeThreshold) {
                hasAlert = true;
                message += `${toReadablePacificDate(dailyData.dt)}: minimum temperature of ${dailyData.temp.min}\n`;
            }
        }

        if (!hasAlert) {
            return {
                hasAlert: false
            }
        }

        await this.recordNotificationForThisSeason();

        return {
            hasAlert: true,
            alertMessage: message,
            notificationType: NotificationType.EMAIL_AND_PUSH
        }
    }

    async shouldNotifyForThisSeason() {

        const season = this.getCurrentWinterSeason();

        const item = await DDB.get(TABLE_NAME, {
            alertKey: this.alertKey + '-' + season
        });

        if (item?.lastTimestamp) {
            return false;
        }

        return true;
    }

    async recordNotificationForThisSeason() {

        const season = this.getCurrentWinterSeason();

        await DDB.put(TABLE_NAME, {
            alertKey: this.alertKey + '-' + season,
            lastTimestamp: toIsoString(new Date())
        })
    }

    getCurrentWinterSeason(): string {
        const date: Date = new Date();
        const year: number = date.getFullYear();
        const month: number = date.getMonth();
        let season = year + "/" + (year + 1);
        if (month < 6) {
            season = (year - 1) + "/" + year;
        }
        return season;
    }
}

