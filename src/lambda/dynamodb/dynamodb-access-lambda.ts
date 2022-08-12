import * as DDB from "../dynamo";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    try {
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
    } catch (e) {
        return failureResponse((e as Error).message);
    }


};

async function httpGet(event: any) {
    required(event.queryStringParameters, "event.queryStringParameters");
    required(event.queryStringParameters.operation, "event.queryStringParameters.operation");

    switch (event.queryStringParameters.operation) {
        case "QUERY":
            await httpGet_query(event);
            break;
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

    const items = DDB.query(table, indexName, hashKeyName, hashKey, rangeKeyName, rangeKey);

    return {
        statusCode: 200,
        headers: {},
        body: JSON.stringify(items)
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
// exports.handler();