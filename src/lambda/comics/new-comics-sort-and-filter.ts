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
    "Vampirella"
]

// TODO - switch to allow list
// Antarctic Press
// BOOM! Studios
// Comixology
// Dark Horse Comics
// DC Comics
// Dynamite
// IDW Publishing
// Image Comics
// Marvel Comics
// Oni Press
// Other
// Red 5
// Skybound
// Top Cow Productions
// Millarworld

// Blizzard?
// Evil Ink?

const PUBLISHERS_TO_EXCLUDE = [
    "A Wave Blue World Inc",
    "Ablaze",
    "Abstract Studio",
    "AC Comics",
    "Acme Ink",
    "Action Lab Comics",
    "Advent Comics",
    "AfterShock Comics",
    "Ahoy Comics",
    "Albatross Funnybooks",
    "American Mythology",
    "Archie Comics",
    "ARH Comix",
    "Artists Writers & Artisans Inc",
    "Astonishing Comics",
    "Asylum Press",
    "Bad Idea Comics",
    "Bad Kids Press",
    "Battle Quest Comics",
    "Behemoth Comics",
    "Bilibili Comics",
    "Binge Books",
    "Black Josei Press",
    "Black Mask Studios",
    "BlackBox Comics",
    "Bliss On Tap Publishing",
    "Blood Moon Comics",
    "Blue Juice Comics",
    "Boundless Comics",
    "BroadSword Comics",
    "Bubble Comics",
    "Clover Press",
    "Coffin Comics",
    "Comic Shop News",
    "Comics Experience Publishing",
    "ComixTribe",
    "Cosmic Times",
    "Counterpoint Comics",
    "Crusade Comics",
    "Cutaway Comics",
    "Domino Books",
    "Egmont",
    "Fantagraphics Books",
    "Floating World Comics",
    "Fluke Publishing",
    "Frew Publications",
    "Heavy Metal",
    "Humanoids",
    "It's Alive",
    "Keenspot",
    "Kenzer & Company",
    "King Features Comics",
    "LINE Webtoon",
    "Mad Cave Studios",
    "Merc Magazine",
    "Milestone",
    "Opus Comics",
    "Papercutz",
    "PaperFilms",
    "Parody Press",
    "Rebellion",
    "Scout Comics",
    "Second Sight Publishing",
    "Shueisha",
    "Silver Sprocket",
    "Sitcomics",
    "Source Point Press",
    "Star Fruit Books",
    "Strangers Fanzine",
    "Titan Books",
    "TwoMorrows",
    "UDON",
    "Uncivilized Books",
    "Valiant",
    "Vault Comics",
    "VIZ Media",
    "Wake Entertainment",
    "Warrant Publishing",
    "Zenescope",
    "AAA Pop",
    "Aardvark-Vanaheim",
    "Invader Comics",
    "Literati Press",
    "Merc Publishing",
    "Storm King Comics",
    "Sumerian Comics",
    "Blacktooth Comics",
    "Iconic Comics",
    "Panel Syndicate",
    "Bad Bug Media",
    "Evoluzione Publishing",
    "Whatnot Publishing",
    "Comely Comix",
    "Comics Experience Publishing",
    "Zine Panique",
    "Artists Elite Comics",
    "Boing Being",
    "Comics Experience Publishing",
    "Really Easy Press",
    "American Nature",
    "Dupuis",
    "Kodansha",
    "Lev Gleason - Comic House",
    "Living the Line",
    "Band of Bards",
    "Basement Comics",
    "Drawn and Quarterly",
    "Frank Miller Presents",
    "Sergio Bonelli Editore",
    "Arcana Studio",
    "First Second Books",
    "Gemstone",
    "Graphix",
    "Kodansha Comics",
    "Random House",
    "Shogakukan Asia",
    "Sigmate Studio",
    "Ten Speed Press",
    "Dell",
    "Glenat",
    "Hillman Periodicals",
    "Seven Seas Entertainment",
    "Chapterhouse Comics",
    "Diamond Publications",
    "Dren Productions",
    "Fair Square Comics",
    "Ape Entertainment",
    "Visi8 Entertainment",
    "Tokyopop",
    "Stranger Comics",
    "Be Amazed Studios",
    "Bubbles Zine",
    "Apex Comics Group",
    "DSTLRY",
    "Glacier Bay Books",
    "Lev Gleason - New Friday",
    "Soaring Penguin Press"
];

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
    "Planet Comics"
]
function removeNumber(title: string) {
    return title.replace(/\s#\d+$/, '');
}

export async function getFilteredAndSortedComics() {
    const newComics = await getNewComics();

    // Apply filters
    const filtered = newComics.filter(comic => !PUBLISHERS_TO_EXCLUDE.includes(comic.publisher))
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
