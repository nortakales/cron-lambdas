
const DYNAMO_ACCESS_ENDPOINT = process.env.DYNAMO_ACCESS_ENDPOINT!;

export interface Product {
    title: string
    website: Website
    urlKey: string,
    url?: string,
    price?: string
    addToCartButton?: string
    status?: string
    promotion?: string
    tags?: string[]
    issues?: string[]
    onSale?: boolean
    retirementDate?: string
}

export interface ProductDiff {
    oldProduct: Product
    newProduct: Product

    diffTitle: boolean
    diffWebsite: boolean
    diffUrlKey: boolean
    diffUrl: boolean
    diffPrice: boolean
    diffAddToCartButton: boolean
    diffStatus: boolean
    diffPromotion: boolean
    diffTags: boolean
    diffIssues: boolean
    diffRetirementDate: boolean

    anyDiff: boolean
}

export interface CommonDiffMetadata {
    commonPriceDiff: boolean
    allPriceDiffs: { [key: string]: number }
    commonAddToCartButtonDiff: boolean
    allAddToCartButtonDiffs: { [key: string]: number }
    commonStatusDiff: boolean
    allStatusDiffs: { [key: string]: number }
    commonPromotionDiff: boolean
    allPromotionDiffs: { [key: string]: number }
    commonTagsDiff: boolean
    allTagsDiffs: { [key: string]: number }
    commonIssuesDiff: boolean
    allIssuesDiffs: { [key: string]: number }
    commonRetirementDateDiff: boolean;
    allRetirementDateDiffs: { [key: string]: number }
}

export enum Website {
    LEGO = 'LEGO'
}

export function generateDeleteUrl(product: Product) {
    return `${DYNAMO_ACCESS_ENDPOINT}?operation=DELETE&table=products&hashKeyName=title&hashKey=${product.title}`;
}

export function generateDiff(oldProduct: Product, newProduct: Product): ProductDiff {

    const diffTitle = oldProduct.title !== newProduct.title;
    const diffWebsite = oldProduct.website !== newProduct.website;
    const diffUrlKey = oldProduct.urlKey !== newProduct.urlKey;
    const diffUrl = oldProduct.url !== newProduct.url;
    const diffPrice = oldProduct.price !== newProduct.price;
    const diffAddToCartButton = oldProduct.addToCartButton !== newProduct.addToCartButton;
    const diffStatus = oldProduct.status !== newProduct.status;
    const diffPromotion = oldProduct.promotion !== newProduct.promotion;
    const diffTags = !arrayEquals(oldProduct.tags, newProduct.tags);
    const diffIssues = !arrayEquals(oldProduct.issues, newProduct.issues);
    const diffRetirementDate = oldProduct.retirementDate !== newProduct.retirementDate;

    return {
        oldProduct,
        newProduct,
        diffTitle,
        diffWebsite,
        diffUrlKey,
        diffUrl,
        diffPrice,
        diffAddToCartButton,
        diffStatus,
        diffPromotion,
        diffTags,
        diffIssues,
        diffRetirementDate,
        anyDiff: diffTitle || diffWebsite || diffUrlKey || diffUrl || diffPrice || diffAddToCartButton ||
            diffStatus || diffPromotion || diffTags || diffIssues || diffRetirementDate

    }
}

export function generateDiffText(diff: ProductDiff, commonDiffMetadata: CommonDiffMetadata) {

    const oldProduct = diff.oldProduct;
    const newProduct = diff.newProduct;

    let text = `<b><a href="${newProduct.url}">${newProduct.title}</a></b>`;
    if (oldProduct.title !== newProduct.title) {
        text += ` <del style="color:red">${oldProduct.title}</del>`;
    }
    if (oldProduct.url !== newProduct.url) {
        text += ` (new URL)`;
    }
    text += ` <a href="${generateDeleteUrl(newProduct)}" style="color:black;">X</a>`

    text += `<br>Price:`;
    if (oldProduct.price !== newProduct.price) {
        text += ` <span style="color:green">${newProduct.price || 'No price'}</span>`;
        text += ` <del style="color:red">${oldProduct.price || 'No price'}</del>`;
    } else {
        text += ` ${newProduct.price || ''}`;
    }

    text += `<br>Status:`;
    if (oldProduct.status !== newProduct.status) {
        text += ` <span style="color:green">${newProduct.status || 'No status'}</span>`;
        text += ` <del style="color:red">${oldProduct.status || 'No status'}</del>`;
    } else {
        text += ` ${newProduct.status || ''}`;
    }

    text += `<br>Promotion:`;
    if (commonDiffMetadata.commonPromotionDiff) {
        text += ` <span style="color:grey">See summary</span>`;
    } else if (oldProduct.promotion !== newProduct.promotion) {
        text += ` <span style="color:green">${newProduct.promotion || 'No promotion'}</span>`;
        text += ` <del style="color:red">${oldProduct.promotion || 'No promotion'}</del>`;
    } else {
        text += ` ${newProduct.promotion || ''}`;
    }

    text += `<br>Add to Cart:`;
    if (oldProduct.addToCartButton !== newProduct.addToCartButton) {
        text += ` <span style="color:green">${newProduct.addToCartButton || 'No addToCartButton'}</span>`;
        text += ` <del style="color:red">${oldProduct.addToCartButton || ' No addToCartButton'}</del>`;
    } else {
        text += ` ${newProduct.addToCartButton || ''}`;
    }

    text += `<br>Tags:`;
    if (!arrayEquals(oldProduct.tags, newProduct.tags)) {
        text += ` <span style="color:green">${newProduct.tags && newProduct.tags.length ? newProduct.tags.join(' ') : 'No tags'}</span>`;
        text += ` <del style="color:red">${oldProduct.tags && oldProduct.tags.length ? oldProduct.tags.join(' ') : 'No tags'}</del>`;
    } else {
        text += ` ${newProduct.tags?.join(' ') || ''}`;
    }

    text += `<br>Retirement Date:`
    if (oldProduct.retirementDate !== newProduct.retirementDate) {
        text += ` <span style="color:green">${newProduct.retirementDate || 'No retirementDate'}</span>`;
        text += ` <del style="color:red">${oldProduct.retirementDate || ' No retirementDate'}</del>`;
    } else {
        text += ` ${newProduct.retirementDate || ''}`;
    }

    // TODO issues

    return text;
}

export function generateText(product: Product) {
    return `<b><a href="${product.url}">${product.title}</a></b> <a href="${generateDeleteUrl(product)}" style="color:black;">X</a><br>
            Price: ${product.price || ''}<br>
            Status: ${product.status || ''}<br>
            Promotion: ${product.promotion || ''}<br>
            Add to Cart: ${product.addToCartButton || ''}<br>
            Tags: ${product.tags?.join(' ') || ''}<br>
            Retirement Date: ${product.retirementDate || ''}`;
}

function arrayEquals(a: string[] | undefined, b: string[] | undefined) {
    return (a === undefined && b === undefined) ||
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}

export function diffIsOnlyCommon(diff: ProductDiff, commonDiffMetadata: CommonDiffMetadata) {
    return commonDiffMetadata.commonAddToCartButtonDiff == diff.diffAddToCartButton &&
        commonDiffMetadata.commonIssuesDiff == diff.diffIssues &&
        commonDiffMetadata.commonPriceDiff == diff.diffPrice &&
        commonDiffMetadata.commonPromotionDiff == diff.diffPromotion &&
        commonDiffMetadata.commonStatusDiff == diff.diffStatus &&
        commonDiffMetadata.commonTagsDiff == diff.diffTags &&
        commonDiffMetadata.commonRetirementDateDiff == diff.diffRetirementDate &&
        !diff.diffTitle && !diff.diffUrl && !diff.diffUrlKey && !diff.diffWebsite;
}

export function generateCommonDiffMetadata(diffs: ProductDiff[]) {
    const commonDiffMetadata: CommonDiffMetadata = {
        commonPriceDiff: false,
        allPriceDiffs: {},
        commonAddToCartButtonDiff: false,
        allAddToCartButtonDiffs: {},
        commonStatusDiff: false,
        allStatusDiffs: {},
        commonPromotionDiff: false,
        allPromotionDiffs: {},
        commonTagsDiff: false,
        allTagsDiffs: {},
        commonIssuesDiff: false,
        allIssuesDiffs: {},
        commonRetirementDateDiff: false,
        allRetirementDateDiffs: {}
    }

    for (const diff of diffs) {
        if (diff.diffPrice) {
            const priceDiffKey = diff.newProduct.price + "/" + diff.oldProduct.price;
            commonDiffMetadata.allPriceDiffs[priceDiffKey] = commonDiffMetadata.allPriceDiffs[priceDiffKey] ?
                commonDiffMetadata.allPriceDiffs[priceDiffKey] + 1 : 1;
        }
        if (diff.diffAddToCartButton) {
            const addToCartButtonDiffKey = diff.newProduct.addToCartButton + "/" + diff.oldProduct.addToCartButton;
            commonDiffMetadata.allAddToCartButtonDiffs[addToCartButtonDiffKey] = commonDiffMetadata.allAddToCartButtonDiffs[addToCartButtonDiffKey] ?
                commonDiffMetadata.allAddToCartButtonDiffs[addToCartButtonDiffKey] + 1 : 1;
        }
        if (diff.diffStatus) {
            const statusDiffKey = diff.newProduct.status + "/" + diff.oldProduct.status;
            commonDiffMetadata.allStatusDiffs[statusDiffKey] = commonDiffMetadata.allStatusDiffs[statusDiffKey] ?
                commonDiffMetadata.allStatusDiffs[statusDiffKey] + 1 : 1;
        }
        if (diff.diffPromotion) {
            const promotionDiffKey = diff.newProduct.promotion + "/" + diff.oldProduct.promotion;
            commonDiffMetadata.allPromotionDiffs[promotionDiffKey] = commonDiffMetadata.allPromotionDiffs[promotionDiffKey] ?
                commonDiffMetadata.allPromotionDiffs[promotionDiffKey] + 1 : 1;
        }
        if (diff.diffRetirementDate) {
            const retirementDateDiffKey = diff.newProduct.retirementDate + "/" + diff.oldProduct.retirementDate;
            commonDiffMetadata.allRetirementDateDiffs[retirementDateDiffKey] = commonDiffMetadata.allRetirementDateDiffs[retirementDateDiffKey] ?
                commonDiffMetadata.allRetirementDateDiffs[retirementDateDiffKey] + 1 : 1;
        }
        // TODO tags and issues - they are arrays
    }

    if (Object.keys(commonDiffMetadata.allPriceDiffs).length == 1 && commonDiffMetadata.allPriceDiffs[Object.keys(commonDiffMetadata.allPriceDiffs)[0]] == diffs.length) {
        commonDiffMetadata.commonPriceDiff = true;
    }
    if (Object.keys(commonDiffMetadata.allAddToCartButtonDiffs).length == 1 && commonDiffMetadata.allAddToCartButtonDiffs[Object.keys(commonDiffMetadata.allAddToCartButtonDiffs)[0]] == diffs.length) {
        commonDiffMetadata.commonAddToCartButtonDiff = true;
    }
    if (Object.keys(commonDiffMetadata.allStatusDiffs).length == 1 && commonDiffMetadata.allStatusDiffs[Object.keys(commonDiffMetadata.allStatusDiffs)[0]] == diffs.length) {
        commonDiffMetadata.commonStatusDiff = true;
    }
    if (Object.keys(commonDiffMetadata.allPromotionDiffs).length == 1 && commonDiffMetadata.allPromotionDiffs[Object.keys(commonDiffMetadata.allPromotionDiffs)[0]] == diffs.length) {
        commonDiffMetadata.commonPromotionDiff = true;
    }
    if (Object.keys(commonDiffMetadata.allRetirementDateDiffs).length == 1 && commonDiffMetadata.allRetirementDateDiffs[Object.keys(commonDiffMetadata.allRetirementDateDiffs)[0]] == diffs.length) {
        commonDiffMetadata.commonRetirementDateDiff = true;
    }

    return commonDiffMetadata;
}

export function diffCount(diff: ProductDiff) {
    let count = 0;
    if (diff.diffAddToCartButton) count++;
    if (diff.diffIssues) count++;
    if (diff.diffPrice) count++;
    if (diff.diffPromotion) count++;
    if (diff.diffStatus) count++;
    if (diff.diffTags) count++;
    if (diff.diffTitle) count++;
    if (diff.diffUrl) count++;
    if (diff.diffUrlKey) count++;
    if (diff.diffWebsite) count++;
    if (diff.diffRetirementDate) count++;
    return count;
}