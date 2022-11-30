import { put, scan } from "../dynamo";
import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";
import { CommonDiffMetadata, generateDiff, generateDiffText, generateText, Product, Website } from "./product";
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

    const productDiffs = [];

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
    }

    const commonDiffMetadata: CommonDiffMetadata = {
        commonPriceDiff: false,
        commonAddToCartButtonDiff: false,
        commonStatusDiff: false,
        commonPromotionDiff: false,
        commonTagsDiff: false,
        commonIssuesDiff: false
    }

    const allPromotionDiffs: { [key: string]: number } = {};

    for (const diff of productDiffs) {
        if (diff.diffPromotion) {
            const promotionDiffKey = diff.newProduct.promotion + "/" + diff.oldProduct.promotion;
            allPromotionDiffs[promotionDiffKey] = allPromotionDiffs[promotionDiffKey] ? allPromotionDiffs[promotionDiffKey] + 1 : 1;
        }
    }
    if (Object.keys(allPromotionDiffs).length == 1 && allPromotionDiffs[Object.keys(allPromotionDiffs)[0]] == productDiffs.length) {
        commonDiffMetadata.commonPromotionDiff = true;
    }

    let diffBody = '';
    let sameBody = '';
    for (const diff of productDiffs) {
        if (diff.anyDiff) {
            diffBody += generateDiffText(diff, commonDiffMetadata) + '<br><br>';
            await put(PRODUCT_TABLE_NAME, diff.newProduct);
            // TODO save history
        } else {
            sameBody += generateText(diff.newProduct) + '<br><br>';
        }
    }


    // TODO
    // store historical record
    // organize by website

    let emailBody = '';

    if (commonDiffMetadata.commonPromotionDiff) {
        emailBody += `<h1>Common Changes</h1>Promotion:`
        emailBody += ` <span style="color:green">${productDiffs[0].newProduct.promotion || 'No promotion'}</span>`;
        emailBody += ` <del style="color:red">${productDiffs[0].oldProduct.promotion || 'No promotion'}</del>`;
    }

    emailBody += `<h1>Changes</h1>
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
exports.handler();