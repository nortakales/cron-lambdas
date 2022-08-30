
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
}

export enum Website {
    LEGO = 'LEGO'
}

export function areDifferent(oldProduct: Product, newProduct: Product) {
    return oldProduct.title !== newProduct.title ||
        oldProduct.website !== newProduct.website ||
        oldProduct.urlKey !== newProduct.urlKey ||
        oldProduct.url !== newProduct.url ||
        oldProduct.price !== newProduct.price ||
        oldProduct.addToCartButton !== newProduct.addToCartButton ||
        oldProduct.status !== newProduct.status ||
        oldProduct.promotion !== newProduct.promotion ||
        !arrayEquals(oldProduct.tags, newProduct.tags) ||
        oldProduct.issues !== newProduct.issues;
}

export function generateDeleteUrl(product: Product) {
    return `${DYNAMO_ACCESS_ENDPOINT}?operation=DELETE&table=products&hashKeyName=title&hashKey=${product.title}`;
}

export function generateDiffText(oldProduct: Product, newProduct: Product) {

    let text = `<b><a href="${newProduct.url}">${newProduct.title}</a>`;
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
    if (oldProduct.promotion !== newProduct.promotion) {
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
        text += ` <span style="color:green">${newProduct.tags && newProduct.tags.length ? newProduct.tags : 'No tags'}</span>`;
        text += ` <del style="color:red">${oldProduct.tags && oldProduct.tags.length ? oldProduct.tags : 'No tags'}</del>`;
    } else {
        text += ` ${newProduct.tags || ''}`;
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
            Tags: ${product.tags || ''}`;
}

function arrayEquals(a: string[] | undefined, b: string[] | undefined) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}