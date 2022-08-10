import * as DDB from "../dynamo";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);
    const body = event.body;
    if (!body) {
        return failureResponse("Missing body");
    }
    const payload = JSON.parse(event.body);

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
            return failureResponse("Unknown operation: " + operation);
    }

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
};

function failureResponse(message: string) {
    console.error(message);
    return {
        statusCode: 400,
        headers: {},
        body: message
    };
}

async function put(event: any) {
    const itemAsString = event.item as string;
    if (!itemAsString) {
        console.error("Missing event.item");
    }
    const item = JSON.parse(itemAsString);
    await DDB.put(event.table, item);
}

async function del(event: any) {
    const keyAsString = event.item as string;
    if (!keyAsString) {
        console.error("Missing event.key");
    }
    const key = JSON.parse(keyAsString);
    await DDB.del(event.table, key);
}

// Uncomment this to call locally
// exports.handler();