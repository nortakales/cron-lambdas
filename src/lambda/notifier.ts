
const Push = require('pushover-notifications')

const pushService = new Push({
    user: 'uith98yw3i8e36uyzykhn3byfnesm2',
    token: 'az17zzuo6nboabno73d7isp5ifw1sw',
})

export async function sendPushNotification(title: string, message: string) {

    console.log("Sending push notification");

    const notification = {
        // These values correspond to the parameters detailed on https://pushover.net/api
        // 'message' is required. All other values are optional.
        message: message,
        title: title,
        sound: 'magic',
        priority: 0
    }

    await pushService.send(notification, function (error: any, result: any) {
        if (error) {
            throw error;
        }

        console.log("Notification result: " + result);
    })
}