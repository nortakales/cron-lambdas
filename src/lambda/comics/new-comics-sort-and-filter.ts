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
    "TMNT",
    "James Bond",
    "007"
]

const KEYWORDS_TO_EXCLUDE = [
    "Vampirella",
    "Power Rangers",
    "Gold Digger",
    "My Little Pony"
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

// The full title with have a pound (#) and decimals removed from the end, and then matched against this in full
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
    "Young Animal",
    "Ant",
    "Ant-Man",
    "Gambit",
    "Iron Fist",
    "Marvel Previews",
    "Mad",
    "Ninja High School",
    "Mighty Morphin Power Rangers",
    "Cinebook",
    "Ediciones La Cupula",
    "Wolverine",
    "Killadelphia",
    "Jungle Comics",
    "Planet Comics",
    "House of Slaughter",
    "Batman Incorporated",
    "Gargoyles",
    "Ghost Rider",
    "X-Men: Red",
    "My Little Pony",
    "Immortal X-Men",
    "Manga Z",
    "Rick and Morty",
    "Shazam!",
    "Captain America",
    "Daredevil",
    "Doctor Strange"
]

function removeNumber(title: string) {
    return title.replace(/\s#\d+$/, '');
}

export async function getFilteredAndSortedComics() {
    const newComics = await getNewComics();

    // Apply filters
    const filtered = newComics.filter(comic => PUBLISHER_ALLOW_LIST.includes(comic.publisher))
        .filter(comic => !SERIES_TO_EXCLUDE.includes(removeNumber(comic.title)))
        .filter(comic => !KEYWORDS_TO_EXCLUDE.some(keyword => comic.title.toLowerCase().includes(keyword.toLowerCase())));

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
