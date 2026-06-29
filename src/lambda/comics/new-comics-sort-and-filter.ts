import { getNewComics } from "./fresh-comics-api";

const KEYWORDS_TO_ALWAYS_INCLUDE = [
    "Stargate",
    "Star Wars",
    "Firefly",
    "Battlestar",
    "Conan",
    "Stranger Things",
    "Manifest Destiny",
    "Chew",
    "Saga",
    "Amory Wars",
    "Hellboy",
    "B.P.R.D",
    "BPRD",
    "TMNT",
    "James Bond",
    "007",
    "Sonic the Hedgehog",
    "Teenage Mutant Ninja Turtles",
    "Baltimore"
]

const KEYWORDS_TO_EXCLUDE = [
    "Vampirella",
    "Power Rangers",
    "Gold Digger",
    "My Little Pony",
    "Powerpuff",
    "ThunderCats",
    "G.I. Joe"
]

const PUBLISHER_ALLOW_LIST = [
    "Antarctic Press",
    "Blizzard Publishing",
    "BOOM! Studios",
    "Comixology",
    "Dark Horse Comics",
    "DC Comics",
    "Dynamite",
    "Evil Ink Comics",
    "IDW Publishing",
    "Image Comics",
    "Marvel Comics",
    "Millarworld",
    "Oni Press",
    "Other",
    "Red 5",
    "Skybound",
    "Titan Books",
    "Top Cow Productions",
    "Vertigo Comics",
]

// Strips trailing issue number (# N) or volume suffix (Volume N / Vol N / Vol. N) to get the base series name
export function extractSeriesName(title: string): string {
    return title.replace(/\s(#\d+|vol(?:ume|\.)?\s+\d+)$/i, '');
}

export async function getFilteredAndSortedComics(excludedSeries: Set<string>) {
    const newComics = await getNewComics();

    // Apply filters
    const filtered = newComics
        .filter(comic => PUBLISHER_ALLOW_LIST.includes(comic.publisher))
        .filter(comic => comic.reprint !== true) // Remove reprints
        .filter(comic => comic.variant !== true) // Remove variants
        .filter(comic => !excludedSeries.has(extractSeriesName(comic.title).toLowerCase()))
        .filter(comic => !KEYWORDS_TO_EXCLUDE.some(keyword => comic.title.toLowerCase().includes(keyword.toLowerCase())))
        // Remove xth printing
        .filter(comic => !/(2nd|3rd|\dth) [Pp]rinting/.test(comic.title));

    // Include must search keywords
    let mustInclude: Comic[] = [];
    for (let keyword of KEYWORDS_TO_ALWAYS_INCLUDE) {
        mustInclude = mustInclude.concat(newComics.filter(comic => comic.title.toLowerCase().includes(keyword.toLowerCase())));
    }
    const finalList = filtered.concat(mustInclude);

    // Make sure everything we have is unique
    const finalUniqueList = finalList.filter((comic, index) => {
        const comicString = JSON.stringify(comic);
        return index === finalList.findIndex(obj => {
            return JSON.stringify(obj) === comicString;
        });
    });

    // Finally, sort
    const sorted = finalUniqueList.sort((first, second) => {
        if (first.publisher < second.publisher) {
            return -1;
        }
        if (first.publisher > second.publisher) {
            return 1;
        }
        if (first.title < second.title) {
            return -1;
        }
        if (first.title > second.title) {
            return 1;
        }
        return 0;
    });

    return sorted;
}


async function test() {
    const comics = await getFilteredAndSortedComics(new Set<string>());
    let publisher: string | null = null;
    for (let comic of comics) {
        if (comic.publisher !== publisher) {
            publisher = comic.publisher;
            console.log(`\n${publisher}`);
        }
        console.log(comic.title);
    }
}

// test();
