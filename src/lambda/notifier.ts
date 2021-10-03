
const Push = require('pushover-notifications')

var p = new Push({
    user: 'uith98yw3i8e36uyzykhn3byfnesm2',
    token: 'az17zzuo6nboabno73d7isp5ifw1sw',
})

var msg = {
    // These values correspond to the parameters detailed on https://pushover.net/api
    // 'message' is required. All other values are optional.
    message: 'Test message',	// required
    title: "Test title",
    sound: 'magic',
    priority: 0
}

p.send(msg, function (err: any, result: any) {
    if (err) {
        throw err
    }

    console.log(result);
})