import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const REGION = process.env.REGION!;
const DDB = DynamoDBDocument.from(new DynamoDB({ region: REGION }));

export async function get(table: string, key: { [key: string]: any }) {

    const item = await DDB.get({
        TableName: table,
        Key: key
    });

    if (item.Item !== undefined) {
        console.log("Found in DDB: " + JSON.stringify(item.Item));
    } else {
        console.log("Did not find DDB item with key " + JSON.stringify(key));
    }

    return item.Item;
}

export async function put(table: string, item: { [key: string]: any }) {

    console.log("Writing to DDB: " + JSON.stringify(item));

    await DDB.put({
        TableName: table,
        Item: item
    });
}