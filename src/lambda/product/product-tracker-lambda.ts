import { put, scan } from "../dynamo";
import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";
import { areDifferent, generateDiffText, generateText, Product, Website } from "./product";
import { getLatestProductData } from "./trackers/lego-tracker";

const ENABLED = process.env.ENABLED!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const PRODUCT_TABLE_NAME = process.env.PRODUCT_TABLE_NAME!;

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    if (ENABLED !== 'true') {
        console.log("Product Tracker is not enabled, exiting...");
        return {
            statusCode: 200,
            headers: {},
            body: "Not enabled"
        };
    }

    const products = await scan(PRODUCT_TABLE_NAME) as Product[];

    if (!products) {
        return {
            statusCode: 200,
            headers: {},
            body: "No products"
        };
    }

    let diffBody = '';
    let sameBody = '';

    for (const product of products) {
        console.log("Looking up latest details for product:");
        console.log(JSON.stringify(product, null, 2));
        let newProduct;
        switch (product.website) {
            case Website.LEGO:
                newProduct = await getLatestProductData(product);
                break;
        }
        if (areDifferent(product, newProduct)) {
            diffBody += generateDiffText(product, newProduct) + '<br><br>';
            await put(PRODUCT_TABLE_NAME, newProduct);
            // TODO save history
        } else {
            sameBody += generateText(newProduct) + '<br><br>';
        }
    }

    // TODO
    // iterate through all products
    // call the appropriate tracker for that product
    //      tracker should query page and get details
    //      tracker should just return latest product
    // store historical record
    // make updates to current product
    // accumulate notifications into email based on diff
    // send email

    const emailBody = `<h1>Changes</h1>
    ${diffBody ? diffBody : 'None'}<br>
    <h1>Summary</h1>
    ${sameBody ? sameBody : 'None'}`;

    await sendEmail({
        toAddresses: EMAIL_LIST.split(','),
        fromAddress: FROM,
        subject: SUBJECT,
        htmlBody: emailBody
    });

    return {
        statusCode: 200,
        headers: {},
        body: "Success"
    };
};

// Uncomment this to call locally
// exports.handler();