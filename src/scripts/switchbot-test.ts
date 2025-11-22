import crypto from 'crypto';
import https from 'https';
import { httpsGet } from '../lambda/http';
import * as SM from '../lambda/secrets';


async function test() {

    const token = '0a06d1e94ba74f2e09baa7be975889eb70063b15f65963ffa5c5a1b111a15fcf807838ba10b07e0b83be8ccfdac725c7';
    const secret = '7e80b4e0215af711f9bbee013fff5135';
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signData = token + timestamp + nonce;
    const sign = crypto
        .createHmac('sha256', secret)
        .update(signData)
        .digest('base64');

    const body = JSON.stringify({
        "command": "turnOn",
        "parameter": "default",
        "commandType": "command"
    });
    const deviceId = "MAC";
    const options = {
        hostname: 'api.switch-bot.com',
        port: 443,
        path: `/v1.1/devices/${deviceId}/commands`,
        method: 'POST',
        headers: {
            "Authorization": token,
            "sign": sign,
            "nonce": nonce,
            "t": timestamp,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
        },
    };





    let response = await httpsGet('https://api.switch-bot.com/v1.1/devices', {
        headers: {
            "Authorization": token,
            "sign": sign,
            "nonce": nonce,
            "t": timestamp
        },

    });
    console.log(JSON.stringify(JSON.parse(response), null, 2));

    response = await httpsGet('https://api.switch-bot.com/v1.1/devices/02-202402271704-22129332/commands', {
        method: 'POST',
        headers: {
            'Authorization': token,
            'sign': sign,
            'nonce': nonce,
            't': timestamp,
            'content-type': 'application/json',
        },
        // body: JSON.stringify({
        //     'commandType': 'command',
        //     'command': 'turnOn',
        //     'parameter': 'default',
        // })
        body: JSON.stringify({
            'commandType': 'command',
            'command': 'Pause',
            'parameter': 'default',
        })
    });
    console.log(JSON.stringify(JSON.parse(response), null, 2));

}

test();