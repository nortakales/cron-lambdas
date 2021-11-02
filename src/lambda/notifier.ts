import * as SM from './secrets';
const Push = require('pushover-notifications')

const PUSHOVER_CONFIG_SECRET_KEY = process.env.PUSHOVER_CONFIG_SECRET_KEY!;

export enum NotificationApplication {
    WEATHER = "WEATHER",
    AUTOX = "AUTOX",
    AWS = "AWS"
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

    const config = await SM.getSecretObject(PUSHOVER_CONFIG_SECRET_KEY);

    const user = application === NotificationApplication.AUTOX ? config.autoxGroup : config.myUser;

    const pushService = new Push({
        user: user,
        token: config[application],
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
