export interface Product {
    title: string
    website: Website
    urlKey: string
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