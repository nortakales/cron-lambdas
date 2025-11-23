import { httpsGet } from '../http';
import * as SM from '../secrets';
import { startLambdaLog } from "../utilities/logging";
import crypto from 'crypto';

const SWITCHBOT_CREDENTIALS_NAME = process.env.SWITCHBOT_CREDENTIALS_NAME!;

const BLANK_SUCCESS = {
    statusCode: 200,
    headers: {},
    body: "Success"
};

exports.handler = async (event: any = {}, context: any = {}) => {
    try {
        startLambdaLog(event, context, process.env);

        required(event.httpMethod, "event.httpMethod");

        switch (event.httpMethod) {
            case "GET":
                return await httpGet(event);
            default:
                return failureResponse("Unknown event.httpMethod: " + event.httpMethod);
        }
    } catch (e) {
        console.error(e);
        return failureResponse((e as Error).message);
    }
};

async function httpGet(event: any) {
    required(event.queryStringParameters, "event.queryStringParameters");
    required(event.queryStringParameters.deviceName, "event.queryStringParameters.deviceName");
    required(event.queryStringParameters.command, "event.queryStringParameters.command");
    // parameter is optional in some commands, default to 'default' if not provided

    const deviceName = event.queryStringParameters.deviceName;
    const command = event.queryStringParameters.command;
    const commandType = event.queryStringParameters.commandType || 'command';
    const parameter = event.queryStringParameters.parameter || 'default';
    // Optional repeat parameter: number of times to send the command. Default: 1
    const repeat = parseRepeatParam(event.queryStringParameters.repeat);

    const authHeaders = await createAuthHeaders();

    // Find the device
    const device = await getDeviceByName(deviceName, authHeaders);
    if (!device) {
        return failureResponse(`Device not found: ${deviceName}`);
    }
    console.log(`Found device: ${JSON.stringify(device, null, 2)}`);

    const url = `https://api.switch-bot.com/v1.1/devices/${device.deviceId}/commands`;
    const body = JSON.stringify({
        command,
        parameter,
        commandType
    });

    const headers = {
        ...authHeaders,
        'Content-Type': 'application/json'
    };

    const results: string[] = [];
    for (let i = 0; i < repeat; i++) {
        console.log(`Sending SwitchBot command (${i + 1}/${repeat}) to device ${device.deviceId}`);
        // send POST
        // reuse the same body/headers for each request
        // httpsGet will throw on non-2xx responses, which will surface as a failure
        // and stop further repetitions
        // If you want to continue on errors, catch per-iteration and record the error instead.
        const res = await httpsGet(url, {
            method: 'POST',
            headers,
            body
        });
        results.push(res);
    }

    if (repeat === 1) {
        return {
            statusCode: 200,
            headers: {},
            body: results[0]
        };
    }

    return {
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ repeat, results })
    };

}

async function createAuthHeaders() {

    const credentials = await SM.getSecretObject(SWITCHBOT_CREDENTIALS_NAME);
    const token = credentials?.token;
    const secret = credentials?.secret;

    if (!token || !secret) {
        throw new Error('Missing SwitchBot token/secret: provide env vars or Secrets Manager names');
    }

    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signData = token + t + nonce;
    const sign = crypto.createHmac('sha256', secret).update(signData).digest('base64');

    return {
        Authorization: token,
        sign,
        nonce,
        t
    };
}

async function getDeviceByName(name: string, authHeaders: {}) {
    const response = await httpsGet('https://api.switch-bot.com/v1.1/devices', {
        headers: authHeaders
    });
    let parsed: any;
    try {
        parsed = JSON.parse(response);
    } catch (e) {
        console.error('Failed to parse devices response', e);
        return undefined;
    }

    const body = parsed.body || {};
    const lists: any[] = [];
    if (Array.isArray(body.deviceList)) lists.push(...body.deviceList);
    if (Array.isArray(body.infraredRemoteList)) lists.push(...body.infraredRemoteList);
    if (Array.isArray(body.meterList)) lists.push(...body.meterList);

    return lists.find((d: any) => d.deviceName === name || d.deviceId === name);
}

function parseRepeatParam(repeatParam: any): number {
    let repeat = 1;
    if (repeatParam !== undefined && repeatParam !== null && repeatParam !== '') {
        const parsed = parseInt(repeatParam, 10);
        if (!isNaN(parsed) && parsed > 0) {
            repeat = parsed;
        }
    }
    return repeat;
}

function required(thing: any, name: string) {
    if (!thing) {
        throw new Error(`Missing ${name}`);
    }
}

function failureResponse(message: string) {
    console.error(message);
    return {
        statusCode: 400,
        headers: {},
        body: message
    };
}


//Uncomment this to call locally
// exports.handler({
//     "resource": "/",
//     "path": "/",
//     "httpMethod": "GET",
//     "headers": {
//         "Accept": "*/*",
//         "Accept-Encoding": "gzip, deflate, br",
//         "CloudFront-Forwarded-Proto": "https",
//         "CloudFront-Is-Desktop-Viewer": "true",
//         "CloudFront-Is-Mobile-Viewer": "false",
//         "CloudFront-Is-SmartTV-Viewer": "false",
//         "CloudFront-Is-Tablet-Viewer": "false",
//         "CloudFront-Viewer-ASN": "7922",
//         "CloudFront-Viewer-Country": "US",
//         "Host": "2sc4ccorf3.execute-api.us-west-2.amazonaws.com",
//         "User-Agent": "Thunder Client (https://www.thunderclient.com)",
//         "Via": "1.1 c21a0d27ceec21e266c9f962d0349438.cloudfront.net (CloudFront)",
//         "X-Amz-Cf-Id": "A5gDtBFT_MDfviy_v6YO73NpbuTN1gselJc5cd9TfSrr0LY5O94p3w==",
//         "X-Amzn-Trace-Id": "Root=1-62f5fba2-7657b98c2f80b1c02aab0731",
//         "X-Forwarded-For": "73.169.243.70, 15.158.4.82",
//         "X-Forwarded-Port": "443",
//         "X-Forwarded-Proto": "https"
//     },
//     "multiValueHeaders": {
//         "Accept": [
//             "*/*"
//         ],
//         "Accept-Encoding": [
//             "gzip, deflate, br"
//         ],
//         "CloudFront-Forwarded-Proto": [
//             "https"
//         ],
//         "CloudFront-Is-Desktop-Viewer": [
//             "true"
//         ],
//         "CloudFront-Is-Mobile-Viewer": [
//             "false"
//         ],
//         "CloudFront-Is-SmartTV-Viewer": [
//             "false"
//         ],
//         "CloudFront-Is-Tablet-Viewer": [
//             "false"
//         ],
//         "CloudFront-Viewer-ASN": [
//             "7922"
//         ],
//         "CloudFront-Viewer-Country": [
//             "US"
//         ],
//         "Host": [
//             "2sc4ccorf3.execute-api.us-west-2.amazonaws.com"
//         ],
//         "User-Agent": [
//             "Thunder Client (https://www.thunderclient.com)"
//         ],
//         "Via": [
//             "1.1 c21a0d27ceec21e266c9f962d0349438.cloudfront.net (CloudFront)"
//         ],
//         "X-Amz-Cf-Id": [
//             "A5gDtBFT_MDfviy_v6YO73NpbuTN1gselJc5cd9TfSrr0LY5O94p3w=="
//         ],
//         "X-Amzn-Trace-Id": [
//             "Root=1-62f5fba2-7657b98c2f80b1c02aab0731"
//         ],
//         "X-Forwarded-For": [
//             "73.169.243.70, 15.158.4.82"
//         ],
//         "X-Forwarded-Port": [
//             "443"
//         ],
//         "X-Forwarded-Proto": [
//             "https"
//         ]
//     },
//     // "queryStringParameters": {
//     //     "hashKey": "republic-fighter-tank-75342",
//     //     "hashKeyName": "urlKey",
//     //     "indexName": "urlKey-index",
//     //     "operation": "QUERY",
//     //     "rangeKey": "LEGO",
//     //     "rangeKeyName": "website",
//     //     "table": "products"
//     // },
//     "queryStringParameters": {
//         "deviceName": "Box",
//         "command": "Pause"
//     },
//     "multiValueQueryStringParameters": {
//         "hashKey": [
//             "republic-fighter-tank-75342"
//         ],
//         "hashKeyName": [
//             "urlKey"
//         ],
//         "indexName": [
//             "urlKey-index"
//         ],
//         "operation": [
//             "QUERY"
//         ],
//         "rangeKey": [
//             "LEGO"
//         ],
//         "rangeKeyName": [
//             "website"
//         ],
//         "table": [
//             "products"
//         ]
//     },
//     "pathParameters": null,
//     "stageVariables": null,
//     "requestContext": {
//         "resourceId": "aer14gvddj",
//         "resourcePath": "/",
//         "httpMethod": "GET",
//         "extendedRequestId": "WvRBdFsrvHcFgpg=",
//         "requestTime": "12/Aug/2022:07:05:06 +0000",
//         "path": "/prod",
//         "accountId": "787068200846",
//         "protocol": "HTTP/1.1",
//         "stage": "prod",
//         "domainPrefix": "2sc4ccorf3",
//         "requestTimeEpoch": 1660287906778,
//         "requestId": "7f4a1a04-41f8-41c4-b22b-92a5c7bc2aeb",
//         "identity": {
//             "cognitoIdentityPoolId": null,
//             "accountId": null,
//             "cognitoIdentityId": null,
//             "caller": null,
//             "sourceIp": "73.169.243.70",
//             "principalOrgId": null,
//             "accessKey": null,
//             "cognitoAuthenticationType": null,
//             "cognitoAuthenticationProvider": null,
//             "userArn": null,
//             "userAgent": "Thunder Client (https://www.thunderclient.com)",
//             "user": null
//         },
//         "domainName": "2sc4ccorf3.execute-api.us-west-2.amazonaws.com",
//         "apiId": "2sc4ccorf3"
//     },
//     "body": null,
//     "isBase64Encoded": false
// });