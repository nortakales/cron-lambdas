import * as DDB from "../dynamo";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    const operation = event.operation as string;
    const table = event.table as string;

    if (!operation) {
        console.error("Missing event.operation");
    }
    if (!table) {
        console.error("Missing event.table");
    }

    switch (operation) {
        case "PUT":
            await put(event);
            break;
        case "DELETE":
            await del(event);
            break;
        default:
            console.error("Unknown operation: " + operation);
    }

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
};

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
exports.handler();