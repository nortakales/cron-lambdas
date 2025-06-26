import { httpsGet } from '../http';
import * as dom from 'node-html-parser';

const baseComicUrl = "https://leagueofcomicgeeks.com";

export async function getNewComics() {


    // This doesn't work
    const formats = [
        1, // Regular issues
        3, // TPBs
        4, // Hardcover
        6 // Annuals
    ]

    /*
     Missing below
        "Blizzard Publishing",
        "Comixology",
        "Evil Ink Comics",
        "Millarworld",
        "Red 5",
        "Skybound",
        "Titan Books",
        "Top Cow Productions",
        "Vertigo Comics",
    */

    const publishers = [
        1, // DC Comics
        2, // Marvel Comics
        5, // Dark Horse Comics
        6, // IDW Publishing
        7, // Image Comics
        8,
        9,
        10,
        12, // Dynamite
        13, // BOOM! Studios
        15,
        16,
        23, // Antarctic Press
        28,
        29, // Oni Press
        33, // Other
        202,
        592
    ];

    let queryString = '';
    for (let index in publishers) {
        queryString += `publisher[${index}]=${publishers[index]}&`
    }

    const html = await httpsGet("https://leagueofcomicgeeks.com/comics/new-comics?" + queryString, {
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