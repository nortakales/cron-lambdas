
const Push = require('pushover-notifications')

const autoxGroup = 'ghsdv971ryphsg528qccwj2mjn6m61';
const myUser = 'uith98yw3i8e36uyzykhn3byfnesm2';

export enum NotificationApplication {
    WEATHER = 'az17zzuo6nboabno73d7isp5ifw1sw',
    AUTOX = 'a4pmfchdyea7wj47hwzzp6i8hz74ov',
    AWS = 'a3bimswo7uzrvezxdjir1cfakpi6c5'
}

export enum Sound {
    PUSHOVER = 'pushover',
    BUGLE = 'bugle',
    MECHANICAL = 'mechanical',
    INTERMISSION = 'intermission'
}

export interface UrlOptions {
    url: string;
    urlTitle: string;
}

export async function sendPushNotification(application: NotificationApplication, title: string, message: string, sound: Sound, url?: UrlOptions) {

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
        sound: sound,
        priority: 0,
        url: url?.url,
        url_title: url?.urlTitle
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