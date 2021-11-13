import { Duration } from "typed-duration";
import { Alert, AlertData, NotificationType } from "../interfaces/alert-types";
import * as DDB from '../../dynamo';
import { Format, toIsoString, toReadablePacificDate } from "../utilities";
import { WeatherData } from "../data-sources/common/common-data";

const TABLE_NAME = process.env.TABLE_NAME!;

const MAX_NOTIFICATIONS_PER_YEAR = 3;

export class YearlyFirstFreezeAlert implements Alert {

    interval = Duration.days.of(1);
    alertTitle = "Yearly First Freeze Alert";
    alertKey = "yearly-first-freeze-alert-daily";

    private readonly freezeThreshold = 34;

    async process(weatherData: WeatherData, adhoc: boolean = false) {

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
                message += `${toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY)}: min temp of ${dailyData.temp.min}°F\n`;
            }
        }

        if (!hasAlert) {
            return {
                hasAlert: false
            }
        }

        await this.recordNotificationForThisSeason(adhoc);

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

        if (typeof item?.count === 'number' && item.count >= MAX_NOTIFICATIONS_PER_YEAR) {
            return false;
        }

        return true;
    }

    async recordNotificationForThisSeason(adhoc: boolean) {

        // Don't update the count if this is an adhoc report
        if (adhoc !== undefined && adhoc === true) {
            return;
        }

        const season = this.getCurrentWinterSeason();
        let count = 1;

        const item = await DDB.get(TABLE_NAME, {
            alertKey: this.alertKey + '-' + season
        });

        if (typeof item?.count === 'number') {
            count = item.count + 1;
        }

        await DDB.put(TABLE_NAME, {
            alertKey: this.alertKey + '-' + season,
            lastTimestamp: toIsoString(new Date()),
            count: count
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

