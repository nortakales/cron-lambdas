import * as DDB from "../dynamo";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    // try {
    startLambdaLog(event, context, process.env);

    if (!event.httpMethod) {
        return failureResponse("Missing event.httpMethod");
    }
    switch (event.httpMethod) {
        case "GET":
            return await httpGet(event);
        case "POST":
            return await httpPost(event);
        default:
            return failureResponse("Unknown httpMethod: " + event.httpMethod);
    }
    // } catch (e) {
    //     console.error(e);
    //     return failureResponse((e as Error).message);
    // }


};

async function httpGet(event: any) {
    required(event.queryStringParameters, "event.queryStringParameters");
    required(event.queryStringParameters.operation, "event.queryStringParameters.operation");

    switch (event.queryStringParameters.operation) {
        case "QUERY":
            return await httpGet_query(event);
        case "DELETE":
            return await httpGet_delete(event);
        default:
            throw new Error("Unknown operation for httpGet: " + event.queryStringParameters.operation);
    }
}

async function httpGet_query(event: any) {
    const params = event.queryStringParameters;
    const table = params.table as string;
    const indexName = params.indexName as string;
    const hashKeyName = params.hashKeyName as string;
    const hashKey = params.hashKey as string;
    const rangeKeyName = params.rangeKeyName as string;
    const rangeKey = params.rangeKey as string;
    required(table, "event.queryStringParameters.table");
    required(indexName, "event.queryStringParameters.indexName");
    required(hashKeyName, "event.queryStringParameters.hashKeyName");
    required(hashKey, "event.queryStringParameters.hashKey");

    console.log(`Running query: ${table}, ${indexName}, ${hashKeyName}, ${hashKey}, ${rangeKeyName}, ${rangeKey}`);
    const items = await DDB.query(table, indexName, hashKeyName, hashKey, rangeKeyName, rangeKey);

    return {
        statusCode: 200,
        headers: {},
        body: JSON.stringify(items)
    };
}

async function httpGet_delete(event: any) {
    const params = event.queryStringParameters;
    const table = params.table as string;
    const hashKeyName = params.hashKeyName as string;
    const hashKey = params.hashKey as string;
    const rangeKeyName = params.rangeKeyName as string;
    const rangeKey = params.rangeKey as string;
    required(table, "event.queryStringParameters.table");
    required(hashKeyName, "event.queryStringParameters.hashKeyName");
    required(hashKey, "event.queryStringParameters.hashKey");

    var item: { [key: string]: string } = {};
    item[hashKeyName] = hashKey;
    if (rangeKeyName && rangeKey) {
        item[rangeKeyName] = rangeKey;
    }

    console.log(`Running delete: ${table}, ${hashKeyName}, ${hashKey}, ${rangeKeyName}, ${rangeKey}`);
    await DDB.del(table, item);

    return {
        statusCode: 200,
        headers: {},
        body: 'Success'
    };
}

function required(thing: any, name: string) {
    if (!thing) {
        throw new Error(`Missing ${name}`);
    }
}

async function httpPost(event: any) {
    const body = event.body;
    if (!body) {
        return failureResponse("Missing body");
    }
    const payload = JSON.parse(body);

    const operation = payload.operation as string;
    const table = payload.table as string;

    if (!operation) {
        return failureResponse("Missing operation");
    }
    if (!table) {
        return failureResponse("Missing table")
    }

    switch (operation) {
        case "PUT":
            await put(payload);
            break;
        case "DELETE":
            await del(payload);
            break;
        default:
            throw new Error("Unknown operation: " + operation);
    }

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
}

function failureResponse(message: string) {
    console.error(message);
    return {
        statusCode: 400,
        headers: {},
        body: message
    };
}

async function put(event: any) {
    if (!event.item) {
        throw new Error("Missing item");
    }
    await DDB.put(event.table, event.item);
}

async function del(event: any) {
    if (!event.key) {
        throw new Error("Missing key");
    }
    await DDB.del(event.table, event.key);
}

// Uncomment this to call locally
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
//     "queryStringParameters": {
//         "hashKey": "republic-fighter-tank-75342",
//         "hashKeyName": "urlKey",
//         "indexName": "urlKey-index",
//         "operation": "QUERY",
//         "rangeKey": "LEGO",
//         "rangeKeyName": "website",
//         "table": "products"
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