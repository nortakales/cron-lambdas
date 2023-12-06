import { httpsGet, httpsGetRefactorMe } from "../../http";
import { Product, Website } from "../product";
import { parse, HTMLElement } from 'node-html-parser';

const LEGO_BASE_URL = 'https://www.lego.com/en-us/product/';
const BRICKSET_BASE_URL = 'https://brickset.com/sets/';
const NUMBER_REGEX = /LEGO (\d+) /;
const BRICK_ECONOMY_RETIRING_SOON_URL = 'https://www.brickeconomy.com/sets/retiring-soon';
const BRICKRANKER_BASE_URL = 'https://brickranker.com/rankings/set/';

export async function getLatestProductData(product: Product, attempts: number = 3): Promise<Product> {

    const legoHtml = await httpsGet(LEGO_BASE_URL + product.urlKey);
    const legoDom = parse(legoHtml);

    let price = getPrice(legoDom);
    const addToCartButton = getAddToCartButton(legoDom);
    const status = getStatus(legoDom);
    let tags = getTags(legoDom);
    const promotion = getPromotion(legoDom);

    const salePrice = getSalePrice(legoDom);
    let onSale = false;
    if (salePrice) {
        price = salePrice;
        tags.push("On sale");
        onSale = true;
    }

    // If some of the stuff is undefined, give it another try
    // TODO this should be abstracted out from lego class
    if (price === undefined && addToCartButton === undefined && status === undefined && (tags === undefined || tags.length == 0) && promotion === undefined) {
        if (--attempts > 0) {
            console.log(`Product appears to be empty, trying again with ${attempts} attempt(s) left`);
            await new Promise(func => { console.log("Sleeping for 1000ms"); setTimeout(func, 1000) });
            return getLatestProductData(product, attempts);
        } else {
            console.log(`Product appears to be empty after all attempts`);
        }
    }

    // Now grab the expire date from Brickset
    let retirementDate = await getRetirementDateFromBrickset(product);
    // const retiringSoonModels = await getRetiringSoonNumbersFromBrickEconomy();
    // const retiringSoonModels = new Set();
    // if (retiringSoonModels.has(getLegoModelNumber(product))) {
    //     retirementDate += " (retiring soon?)";
    // }

    try {
        const brickRankerHtml = await httpsGet(BRICKRANKER_BASE_URL + getLegoModelNumber(product) + '-1');
        const brickRankerDom = parse(brickRankerHtml);

        const brickRankerStatus = getStatusFromBrickRanker(brickRankerDom);
        if (brickRankerStatus && brickRankerStatus !== 'Active') {
            tags.push(brickRankerStatus);
        }
        const brickRankerRetirement = getRetirementDateFromBrickRanker(brickRankerHtml);
        if (retirementDate && brickRankerRetirement) {
            retirementDate += ' | ' + brickRankerRetirement;
        } else if (brickRankerRetirement) {
            retirementDate = brickRankerRetirement;
        }
    } catch (error) {

    }

    return {
        title: product.title,
        website: product.website,
        urlKey: product.urlKey,
        price,
        addToCartButton,
        status,
        tags,
        promotion,
        url: LEGO_BASE_URL + product.urlKey,
        onSale,
        retirementDate
    } as Product;
}

function getPrice(dom: HTMLElement) {
    let text = dom.querySelector('div[class*="ProductDetailsPagestyles__ProductOverviewContainer"] span[data-test="product-price"]')?.innerText;
    if (text) {
        text = text.toLowerCase().replace('price', '');
    }
    return text;
}

function getSalePrice(dom: HTMLElement) {
    let text = dom.querySelector('div[class*="ProductDetailsPagestyles__ProductOverviewContainer"] span[data-test="product-price-sale"]')?.innerText;
    if (text) {
        text = text.toLowerCase().replace('sale price', '');
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
    if (text) {
        text = text.replace(/\*?Not VIP\?/, '');
        text = text.replace(/\*Learn more/, '');
    }
    return text;
}

async function getRetirementDateFromBrickset(product: Product) {

    const html = await httpsGetRefactorMe(BRICKSET_BASE_URL + getLegoModelNumber(product), 2, false, true);
    const dom = parse(html);

    return getRetirementDate(dom);
}

function getRetirementDate(dom: HTMLElement) {
    let text = dom.querySelector('dt:contains("Launch/exit")')?.nextElementSibling.innerText;
    if (text) {
        text = text.replace(/^\d+ \w+ \d+ \- /, '');
        text = text.replace("{t.b.a}", "TBA")
    }
    return text;
}

async function getRetiringSoonNumbersFromBrickEconomy() {

    const html = await httpsGet(BRICK_ECONOMY_RETIRING_SOON_URL);
    const dom = parse(html);

    var modelNumbers = new Set();

    dom.querySelectorAll('.ctlsets-left > div > h4')?.forEach(function (element) {
        const match = element.innerText.match(/^(\d+)[ \-]/);
        if (!match || !match[1]) {
            throw Error("Could not parse number from: " + element.innerText);
        }
        modelNumbers.add(match[1]);
    });

    return modelNumbers;
}

function getLegoModelNumber(product: Product) {
    const match = product.title.match(NUMBER_REGEX);
    if (!match || !match[1]) {
        throw Error("Could not parse number from title: " + product.title);
    }
    return match[1];
}

function getStatusFromBrickRanker(dom: HTMLElement) {
    let text = dom.querySelector('strong:contains("Status:")')?.nextElementSibling.innerText;
    return text;
}
function getRetirementDateFromBrickRanker(html: string) {

    // This is necessary because BrickRanker has malformed html that isn't parsed by the library

    const match = html.match(/<strong>Retired:.+?<\/p>/s)
    if (!match || !match[0]) {
        throw Error("Could not parse retirement date from BrickRanker");
    }
    return match[0]
        .replace(/<.+?>/g, '')
        .replace('Retired:', '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function test() {
    // const testProduct: Product = {
    //     title: "LEGO 75342 - Republic Fighter Tank",
    //     website: Website.LEGO,
    //     urlKey: "hogwarts-moment-charms-class-76385"
    // }
    // const returnedProduct = await getLatestProductData(testProduct);
    // console.log(JSON.stringify(returnedProduct, null, 2));
    console.log("Testing...");
    //console.log(await getRetiringSoonNumbersFromBrickEconomy());
    let html = await httpsGet('https://brickranker.com/rankings/set/40539-1');
    let dom = parse(html);

    console.log(getStatusFromBrickRanker(dom));
    console.log(getRetirementDateFromBrickRanker(html));
}

// Uncomment to test
// test();

