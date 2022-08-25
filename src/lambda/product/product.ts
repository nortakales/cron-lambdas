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

export function generateDiffText(oldProduct: Product, newProduct: Product) {

    let text = `<b><a href="${newProduct.url}">${newProduct.title}</a>`;
    if (oldProduct.title !== newProduct.title) {
        text += ` <del style="color:red">${oldProduct.title}</del>`;
    }
    if (oldProduct.url !== newProduct.url) {
        text += ` (new URL)`;
    }

    text += `<br>Price: ${newProduct.price ? newProduct.price : ''}`;
    if (oldProduct.price !== newProduct.price) {
        text += ` <del style="color:red">${oldProduct.price ? oldProduct.price : 'None'}</del>`;
    }

    text += `<br>Status: ${newProduct.status ? newProduct.status : ''}`;
    if (oldProduct.status !== newProduct.status) {
        text += ` <del style="color:red">${oldProduct.status ? oldProduct.status : 'None'}</del>`;
    }

    text += `<br>Promotion: ${newProduct.promotion ? newProduct.promotion : ''}`;
    if (oldProduct.promotion !== newProduct.promotion) {
        text += ` <del style="color:red">${oldProduct.promotion ? oldProduct.promotion : 'None'}</del>`;
    }

    text += `<br>Add to Cart: ${newProduct.addToCartButton ? newProduct.addToCartButton : ''}`;
    if (oldProduct.addToCartButton !== newProduct.addToCartButton) {
        text += ` <del style="color:red">${oldProduct.addToCartButton ? oldProduct.addToCartButton : 'None'}</del>`;
    }

    text += `<br>Tags: ${newProduct.tags ? newProduct.tags : ''}`;
    if (!arrayEquals(oldProduct.tags, newProduct.tags)) {
        text += ` <del style="color:red">${oldProduct.tags ? oldProduct.tags : 'None'}</del>`;
    }

    // TODO issues

    return text;
}

export function generateText(product: Product) {
    return `<b><a href="${product.url}">${product.title}</a></b><br>
            Price: ${product.price ? product.price : ''}<br>
            Status: ${product.status ? product.status : ''}<br>
            Promotion: ${product.promotion ? product.promotion : ''}<br>
            Add to Cart: ${product.addToCartButton ? product.addToCartButton : ''}<br>
            Tags: ${product.tags ? product.tags : ''}`;
}

function arrayEquals(a: string[] | undefined, b: string[] | undefined) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}