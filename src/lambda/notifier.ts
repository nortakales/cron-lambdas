
const Push = require('pushover-notifications')

const autoxGroup = 'ghsdv971ryphsg528qccwj2mjn6m61';
const myUser = 'uith98yw3i8e36uyzykhn3byfnesm2';

export enum NotificationApplication {
    WEATHER = 'az17zzuo6nboabno73d7isp5ifw1sw',
    AUTOX = 'a4pmfchdyea7wj47hwzzp6i8hz74ov',
    AWS = 'a3bimswo7uzrvezxdjir1cfakpi6c5'
}

export async function sendPushNotification(application: NotificationApplication, title: string, message: string, url?: string) {

    console.log("Sending push notification");

    const user = application === NotificationApplication.AUTOX ? autoxGroup : myUser;

    const pushService = new Push({
        user: user,
        token: application,
    })

    const notification = {
        // These values correspond to the parameters detailed on https://pushover.net/api
        // 'message' is required. All other values are optional.
        message: message,
        title: title,
        sound: 'pushover',
        priority: 0,
        url: url
    }

    const promise = new Promise<void>((resolve, reject) => {
        pushService.send(notification, function (error: any, result: any) {
            if (error) {
                reject(error);
            }

            console.log("Notification result: " + result);
            resolve();
        })
    });

    return promise;
}