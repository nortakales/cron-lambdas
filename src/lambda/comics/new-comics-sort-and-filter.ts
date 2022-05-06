import { getNewComics } from "./league-of-comic-geeks-api";

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
    "TMNT"
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
    "American Mythology",
    "Counterpoint Comics",
    "PaperFilms",
    "Rebellion",
    "Scout Comics",
    "Star Fruit Books",
    "ARH Comix",
    "Acme Ink",
    "Black Josei Press",
    "Black Mask Studios",
    "BroadSword Comics",
    "Heavy Metal",
    "Kenzer & Company",
    "Papercutz",
    "Parody Press",
    "Shueisha",
    "Source Point Press",
    "Warrant Publishing",
    "Cosmic Times",
    "Egmont",
    "Blood Moon Comics",
    "Blue Juice Comics",
    "TwoMorrows",
    "Advent Comics",
    "King Features Comics",
    "Milestone",
    "Silver Sprocket",
    "BlackBox Comics",
    "Bliss On Tap Publishing",
    "Boundless Comics",
    "Coffin Comics",
    "Comic Shop News",
    "ComixTribe",
    "Humanoids",
    "Keenspot",
    "Albatross Funnybooks",
    "AC Comics",
    "Bad Kids Press",
    "Strangers Fanzine",
    "Floating World Comics",
    "Comics Experience Publishing",
    "Cutaway Comics",
    "Fantagraphics Books",
    "Merc Magazine",
    "Domino Books",
    "Sitcomics",
    "UDON",
    "Bubble Comics",
    "Uncivilized Books",
    "A Wave Blue World Inc",
    "Astonishing Comics"
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
    "Mega",
    "Catwoman",
    "Nightwing",
    "Scooby-Doo, Where Are You?",
    "Barbarella",
    "Black Panther",
    "Venom",
    "Exciting Comics",
    "Gold Digger",
    "Power Rangers",
    "Power Rangers Universe",
    "Action Comics",
    "Justice League",
    "The Flash",
    "Magic: The Gathering",
    "Crush & Lobo",
    "Suicide Squad",
    "Captain Marvel",
    "Shang-Chi",
    "Thor",
    "Mighty Morphin",
    "Vampiverse",
    "Savage Dragon",
    "Fantastic Four",
    "Green Lantern",
    "Looney Tunes",
    "She-Hulk",
    "Young Animal"
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
