import { put, scan } from "../dynamo";
import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";
import { diffCount, diffIsOnlyCommon, generateCommonDiffMetadata, generateDiff, generateDiffText, generateText, Product, Website } from "./product";
import { getLatestProductData } from "./trackers/lego-tracker";
import * as SM from '../secrets';

const ENABLED = process.env.ENABLED!;
const EMAIL_LIST = process.env.EMAIL_LIST!;
const SUBJECT = process.env.SUBJECT!;
const FROM = process.env.FROM!;
const PRODUCT_TABLE_NAME = process.env.PRODUCT_TABLE_NAME!;
const API_KEY_DYNAMO_ACCESS_LAMBDA = process.env.API_KEY_DYNAMO_ACCESS_LAMBDA!;

const SLEEP_BETWEEN_PRODUCTS_MS = 1000;

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

    const productDiffs = [];
    let saleBody = '';

    for (const product of products) {
        console.log("Looking up latest details for product:");
        console.log(JSON.stringify(product, null, 2));
        let newProduct;
        switch (product.website) {
            case Website.LEGO:
                newProduct = await getLatestProductData(product);
                break;
        }
        productDiffs.push(generateDiff(product, newProduct));

        if (newProduct.onSale) {
            saleBody += `<b><a href="${product.url}">${product.title}</a></b><br>`;
        }

        // Pause in between to help with all of the URLs we call
        console.log(`Pausing for ${SLEEP_BETWEEN_PRODUCTS_MS}ms before next product`);
        await new Promise(r => setTimeout(r, SLEEP_BETWEEN_PRODUCTS_MS));
    }

    // If a high percentage of products have changed, something is probably wrong
    let updateProducts = true;
    const numDiffs = productDiffs.filter(diff => diff.anyDiff).length;
    if (numDiffs / productDiffs.length > 0.75) {
        console.log(`Too many products changed (${numDiffs} of ${productDiffs.length}), not updating updating database`);
        updateProducts = false;
    }


    // Sort by # of changes then title
    productDiffs.sort(function (first, second) {
        const firstDiffCount = diffCount(first);
        const secondDiffCount = diffCount(second);
        if (firstDiffCount == secondDiffCount) {
            return first.newProduct.title.localeCompare(second.newProduct.title);
        } else {
            return secondDiffCount - firstDiffCount;
        }
    });

    const commonDiffMetadata = generateCommonDiffMetadata(productDiffs);

    const apiKey = await SM.getSecretString(API_KEY_DYNAMO_ACCESS_LAMBDA) as string;

    let diffBody = '';
    let sameBody = '';
    for (const diff of productDiffs) {
        if (diff.anyDiff) {
            if (updateProducts) {
                await put(PRODUCT_TABLE_NAME, diff.newProduct);
            }
            // TODO save history
            if (diffIsOnlyCommon(diff, commonDiffMetadata)) {
                sameBody += generateText(diff.newProduct, apiKey) + '<br><br>';
            } else {
                diffBody += generateDiffText(diff, commonDiffMetadata, apiKey) + '<br><br>';
            }
        } else {
            sameBody += generateText(diff.newProduct, apiKey) + '<br><br>';
        }
    }


    // TODO
    // store historical record
    // group by website

    let emailBody = '';

    if (!updateProducts) {
        emailBody += `<h1 style="color:red">WARNING: Too many products changed, database not updated</h1>`;
    }

    if (commonDiffMetadata.commonPromotionDiff) {
        emailBody += `<h1>Common Changes</h1>Promotion:`
        emailBody += ` <span style="color:green">${productDiffs[0].newProduct.promotion || 'No promotion'}</span>`;
        emailBody += ` <del style="color:red">${productDiffs[0].oldProduct.promotion || 'No promotion'}</del>`;
    }

    emailBody += `<h1>Changes</h1>
    ${diffBody ? diffBody : 'None'}
    ${saleBody ? '<h1>Sales</h1>' + saleBody : ''}
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