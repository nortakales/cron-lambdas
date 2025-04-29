import { httpsGet } from '../http';
import * as dom from 'node-html-parser';

const baseComicUrl = "https://leagueofcomicgeeks.com";

export async function getNewComics() {

    const html = await httpsGet("https://leagueofcomicgeeks.com/comics/new-comics", {
        useProxy: true
    });
    const root = dom.parse(html);

    const comicList = root.querySelectorAll("#comic-list-issues > li:not(.variant-collapsed)");

    let newComics: Comic[] = [];

    for (let comic of comicList) {
        const title = comic.querySelector(".title")?.text?.trim();
        const publisher = comic.querySelector(".publisher")?.text?.trim();
        let imageUrl = comic.querySelector(".cover img")?.getAttribute("data-src");
        const comicUrl = baseComicUrl + comic.querySelector(".cover a")?.getAttribute("href");

        if (imageUrl === '/assets/images/no-cover-med.jpg') {
            imageUrl = baseComicUrl + imageUrl;
        }

        newComics.push({
            title: title || "Untitled",
            publisher: publisher || "No Publisher",
            imageUrl: imageUrl || "No image",
            comicUrl
        })
    }

    return newComics;
}