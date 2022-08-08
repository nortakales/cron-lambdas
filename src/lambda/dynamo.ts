import { DynamoDBDocument, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const REGION = process.env.REGION!;
const dynamoClient = new DynamoDB({ region: REGION });
const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
};
const translateConfig: TranslateConfig = { marshallOptions, unmarshallOptions };

const DDB = DynamoDBDocument.from(dynamoClient, translateConfig);

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
        Item: item,
    });
}

export async function scan(table: string) {

    // TODO support pagination

    const output = await DDB.scan({
        TableName: table
    });

    return output.Items;
}