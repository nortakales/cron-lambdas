import { httpsGet } from '../http';
import { parse } from 'node-html-parser';

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36";
const baseComicUrl = "https://leagueofcomicgeeks.com";

export async function getNewComics() {

    const html = await httpsGet("https://leagueofcomicgeeks.com/comics/new-comics", userAgent);
    const root = parse(html);

    const comicList = root.querySelectorAll("#comic-list-issues > li");

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