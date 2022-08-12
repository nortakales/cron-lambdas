import * as DDB from "../dynamo";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);
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

    try {
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
    } catch (e) {
        return failureResponse((e as Error).message);
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