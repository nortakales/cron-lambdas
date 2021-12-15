import { getNewComics } from "./league-of-comic-geeks-api";

const KEYWORDS_TO_ALWAYS_INCLUDE = [
    "Stargate",
    "Star Wars",
    "Firefly",
    "Battlestar"
]

const PUBLISHERS_TO_EXCLUDE = [
    "Ablaze",
    "Abstract Studio",
    "Action Lab Comics",
    "AfterShock Comics",
    "Ahoy Comics",
    "Archie Comics",
    "Artists Writers & Artisans Inc",
    "Bad Idea Comics",
    "Behemoth Comics",
    "Binge Books",
    "Clover Press",
    "Frew Publications",
    "It's Alive",
    "Mad Cave Studios",
    "Second Sight Publishing",
    "Titan Books",
    "Valiant",
    "Vault Comics",
    "Wake Entertainment",
    "Zenescope",
];

// The full title with have a pund (#) and decimals removed from the end, and then matched against this in full
const SERIES_TO_EXCLUDE = [
    "The Batman & Scooby-Doo Mysteries",
    "Harley Quinn: The Animated Series - The Eat, Bang, Kill Tour",
    "BRZRKR",
    "Getting Dizzy",
    "We Have Demons",
    "Batgirls",
    "Black Manta",
    "Teen Titans Academy",
    "Titans United",
    "Wonder Girl",
    "Wonder Woman",
    "Apex Legends: Overtime",
    "Army of Darkness 1979",
    "Army of Darkness",
    "Elvira Meets Vincent Price",
    "KISS: Phantom Obsession",
    "Red Sonja: Black, White, Red",
    "Sheena: Queen of the Jungle",
    "Vampirella / Dracula: Unholy",
    "Vampirella",
    "G.I. Joe: A Real American Hero",
    "Jupiter's Legacy: Requiem",
    "King Spawn",
    "Defenders",
    "Excalibur",
    "Hulk",
    "Ka-Zar: Lord of the Savage Land",
    "Miles Morales: Spider-Man",
    "Savage Avengers",
    "The Thing",
    "X-Force",
    "Rick And Morty: Corporate Assets",
    "Mega"
]
function removeNumber(title: string) {
    return title.replace(/\s#\d+$/, '');
}

export async function getFilteredAndSortedComics() {
    const newComics = await getNewComics();

    // Apply filters
    const filteredPublishers = newComics.filter(comic => !PUBLISHERS_TO_EXCLUDE.includes(comic.publisher));
    const filteredSeries = filteredPublishers.filter(comic => !SERIES_TO_EXCLUDE.includes(removeNumber(comic.title)));

    // Include must search keywords
    let mustInclude: Comic[] = [];
    for (let keyword of KEYWORDS_TO_ALWAYS_INCLUDE) {
        mustInclude = mustInclude.concat(newComics.filter(comic => comic.title.toLowerCase().includes(keyword.toLowerCase())));
    }
    const finalList = filteredSeries.concat(mustInclude);

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
    const comics = await getFilteredAndSortedComics();
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