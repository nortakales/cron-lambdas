import { scan } from "../dynamo";
import { sendEmail } from "../emailer";
import { startLambdaLog } from "../utilities/logging";
import { Product, Website } from "./product";
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

    let emailBody = '';

    for (const product of products) {
        console.log("Looking up latest details for product:");
        console.log(JSON.stringify(product, null, 2));
        let newProduct;
        switch (product.website) {
            case Website.LEGO:
                newProduct = await getLatestProductData(product);
                break;
        }
        emailBody += `<b><a href="${newProduct.url}">${newProduct.title}</a></b><br>
        Price: ${newProduct.price ? newProduct.price : ''}<br>
        Status: ${newProduct.status ? newProduct.status : ''}<br>
        Promotion: ${newProduct.promotion ? newProduct.promotion : ''}<br>
        Add to Cart: ${newProduct.addToCartButton ? newProduct.addToCartButton : ''}<br>
        Tags: ${newProduct.tags ? newProduct.tags : ''}<br>
        <br>`;
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