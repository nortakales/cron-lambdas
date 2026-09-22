import { DynamoDBDocument, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { DynamoDB, ReturnValue } from "@aws-sdk/client-dynamodb";

const REGION = process.env.REGION!;
const dynamoClient = new DynamoDB({ region: REGION });
const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: true, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
};
const translateConfig: TranslateConfig = { marshallOptions, unmarshallOptions };

const DDB = DynamoDBDocument.from(dynamoClient, translateConfig);

// Some tables (e.g. the generic HTTP cache) can store large items (cached, possibly gzip-compressed
// HTML/JSON bodies), so avoid dumping the full item into CloudWatch logs every time one is read or
// written. Binary attributes come back from the document client as Buffers, whose default
// JSON.stringify representation is a `{ type: 'Buffer', data: [...] }` array of every byte as a
// separate number, which would balloon the string far past MAX_LOGGED_CHARS before truncation ever
// gets a chance to run, so collapse those to a short summary first.
function stringifyForLog(value: any): string {
    return JSON.stringify(value, (_key, val) => {
        if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
            return `<Buffer, ${val.data.length} bytes>`;
        }
        return val;
    });
}

const MAX_LOGGED_CHARS = 2000;
function truncateForLog(value: string): string {
    if (value.length <= MAX_LOGGED_CHARS) {
        return value;
    }
    return value.slice(0, MAX_LOGGED_CHARS) + `... (truncated, ${value.length} total chars)`;
}

export async function get(table: string, key: { [key: string]: any }) {

    const item = await DDB.get({
        TableName: table,
        Key: key
    });

    if (item.Item !== undefined) {
        console.log("Found in DDB: " + truncateForLog(stringifyForLog(item.Item)));
    } else {
        console.log("Did not find DDB item with key " + JSON.stringify(key));
    }

    return item.Item;
}

export async function query(table: string, indexName: string, hashKeyName: string, hashKey: string, rangeKeyName?: string, rangeKey?: string) {

    let keyConditionExpression = `${hashKeyName} = :hkey`;
    let keyConditionExpressionValues: { [key: string]: string } = {
        ':hkey': hashKey,
    };
    if (rangeKeyName && rangeKey) {
        keyConditionExpression += ` and ${rangeKeyName} = :rkey`;
        keyConditionExpressionValues[':rkey'] = rangeKey;
    }

    const query = {
        TableName: table,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: keyConditionExpressionValues
    };

    console.log(`Running query: ${table}:  ${JSON.stringify(query)}`);

    const item = await DDB.query(query);

    if (item.Items !== undefined) {
        console.log("Found in DDB: " + truncateForLog(stringifyForLog(item.Items)));
    } else {
        console.log("Did not find DDB item(s) for query " + JSON.stringify(query));
    }

    return item.Items;
}

export async function put(table: string, item: { [key: string]: any }) {

    console.log(`Writing to DDB: ${table}: ${truncateForLog(stringifyForLog(item))}`);

    await DDB.put({
        TableName: table,
        Item: item,
    });
}

export async function scan(table: string) {

    console.log("Scanning DDB table: " + table);

    // TODO support pagination

    const output = await DDB.scan({
        TableName: table
    });

    return output.Items;
}

export async function del(table: string, key: { [key: string]: any }) {

    console.log(`Deleting from DDB: ${table}: ${JSON.stringify(key)}`);

    return await DDB.delete({
        TableName: table,
        Key: key,
        ReturnValues: ReturnValue.ALL_OLD
    });
}