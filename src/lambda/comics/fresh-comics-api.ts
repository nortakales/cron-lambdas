import { parse } from 'path';
import { httpsGet } from '../http';
import * as dom from 'node-html-parser';

const baseComicUrl = "https://freshcomics.us";

export async function getNewComics() {

    const html = await httpsGet("https://freshcomics.us/this_week");
    const root = dom.parse(html);

    const publisherNodes = root.querySelectorAll("body > main > div > div > div.col-12.col-lg-8 > div.col-12");

    let newComics: Comic[] = [];
    for (let publisherNode of publisherNodes) {
        const publisher = publisherNode.querySelector("div > div.col-6.mb-3")?.innerText.trim();
        //console.log(publisher);

        const comicList = publisherNode.querySelectorAll("div.col-sm-3.mb-4");

        for (let comicNode of comicList) {
            const comicUrl = comicNode.querySelector("div > a")?.getAttribute("href");
            const imageUrl = comicNode.querySelector("div > a > img")?.getAttribute("src");
            const title = comicNode.querySelector("div > div > p > a > small")?.innerText.trim().replace(/\s\(.* Cover\)/, '');
            const tagNode = comicNode.querySelector("div > div > p > a > span");
            const reprint = tagNode?.innerText.trim() === "2nd" || false;
            const variant = tagNode?.querySelector('i.bi.bi-asterisk') != undefined || false;
            const comicObj: Comic = {
                title: title || "Untitled",
                publisher: publisher || "No Publisher",
                imageUrl: imageUrl || "No image",
                comicUrl: comicUrl ? baseComicUrl + comicUrl : "No URL",
                reprint: reprint,
                variant: variant
            };
            newComics.push(comicObj);
        }
    }

    // TODO remove duplicates based on title and publisher
    newComics = newComics.filter((comic, index, self) =>
        index === self.findIndex((c) => c.title === comic.title && c.publisher === comic.publisher)
    );
    return newComics;
}

// getNewComics();