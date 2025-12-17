import { startLambdaLog } from "../utilities/logging";
import { sendSwitchBotCommand } from './switchbot-api';

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

    const deviceName = event.queryStringParameters.deviceName;
    const commandParam = event.queryStringParameters.command;
    const repeat = parseRepeatParam(event.queryStringParameters.repeat);

    try {
        const results = await sendSwitchBotCommand(deviceName, commandParam, repeat);
        return {
            statusCode: 200,
            headers: {},
            body: JSON.stringify(results)
        };
    } catch (err) {
        return failureResponse((err as Error).message);
    }

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