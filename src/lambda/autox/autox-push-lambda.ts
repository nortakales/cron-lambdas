import { NotificationApplication, sendPushNotification, Sound, UrlOptions } from "../notifier";

exports.handler = async (event: any = {}, context: any = {}) => {
    console.log("Running...");

    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    const body = 'Registration is opening soon!\n' +
        event.name + '\n' +
        event.url + '\n' +
        new Date(event.registrationDate).toLocaleString('en-us', { timeZone: 'America/Los_Angeles' });

    const urlOptions: UrlOptions = {
        url: event.url,
        urlTitle: event.name
    }

    await sendPushNotification(NotificationApplication.AUTOX, "AutoX Alert", body, Sound.BUGLE, urlOptions);

    console.log("Done");
};

// exports.handler({
//     name: "2021, October 17th Auto X Powered by 425 Motorsports",
//     url: "https://evergreenspeedway.com/events/2021-october-17th-auto-x-powered-by-425-motorsports-2/",
//     registrationDate: 1633741200000
// });