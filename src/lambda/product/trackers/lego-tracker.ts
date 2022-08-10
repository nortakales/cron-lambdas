import { httpsGet } from "../../http";
import { Product, Website } from "../product";
import { parse, HTMLElement } from 'node-html-parser';

const BASE_URL = 'https://www.lego.com/en-us/product/';

export async function getLatestProductData(product: Product): Promise<Product> {

    const html = await httpsGet(BASE_URL + product.urlKey);
    const dom = parse(html);

    const price = getPrice(dom);
    const addToCartButton = getAddToCartButton(dom);
    const status = getStatus(dom);
    const tags = getTags(dom);
    const promotion = getPromotion(dom);

    return {
        title: product.title,
        website: product.website,
        urlKey: product.urlKey,
        price,
        addToCartButton,
        status,
        tags,
        promotion,
        url: BASE_URL + product.urlKey
    } as Product;
}

function getPrice(dom: HTMLElement) {
    let text = dom.querySelector('span[data-test="product-price"]')?.innerText;
    if (text) {
        text = text.toLowerCase().replace('price', '');
    }
    return text;
}

function getAddToCartButton(dom: HTMLElement) {
    let text = dom.querySelector('button[data-test="add-to-bag"]')?.innerText;
    return text;
}

function getStatus(dom: HTMLElement) {
    let text = dom.querySelector('p[data-test="product-overview-availability"]')?.innerText;
    return text;
}

function getTags(dom: HTMLElement) {
    const tags = dom.querySelectorAll('div[class*="ProductOverviewstyles__ProductBadgesRow"] span[data-test="product-flag"]').map(element => element.innerText);
    return tags;
}

function getPromotion(dom: HTMLElement) {
    let text = dom.querySelector('div[class*="TargetedPromotionstyles"]')?.innerText;
    return text;
}

async function test() {
    const testProduct: Product = {
        title: "LEGO 75342 - Republic Fighter Tank",
        website: Website.LEGO,
        urlKey: "hogwarts-moment-charms-class-76385"
    }
    const returnedProduct = await getLatestProductData(testProduct);
    console.log(JSON.stringify(returnedProduct, null, 2));
}

// Uncomment to test
//test();