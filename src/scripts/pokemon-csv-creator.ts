import { httpsGet } from "../lambda/http";

import { parse, HTMLElement } from 'node-html-parser';


const baseUrl = 'https://www.serebii.net/';
const generationNumber = 5;
const generations = {
    1: {
        start: 1,
        end: 151,
        generationString: 'pokedex',
        games: [
            'Red',
            'Blue (Intl.)',
            'Yellow'
        ]
    },
    2: {
        start: 1,
        end: 251,
        generationString: 'pokedex-gs',
        games: [
            'Gold',
            'Silver',
            'Crystal'
        ]
    },
    3: {
        start: 1,
        end: 386,
        generationString: 'pokedex-rs',
        games: [
            'Ruby',
            'Sapphire',
            'Emerald',
            'FireRed',
            'LeafGreen'
        ]
    },
    4: {
        start: 1,
        end: 493,
        generationString: 'pokedex-dp',
        games: [
            'Diamond',
            'Pearl',
            'Platinum',
            'HeartGold',
            'SoulSilver'
        ]
    },
    5: {
        start: 1,
        end: 649,
        generationString: 'pokedex-bw',
        games: [
            'Black',
            'White',
            'Black 2',
            'White 2'
        ]
    }
}
const generation = generations[generationNumber];


async function main() {

    for (let number = generation.start; number <= generation.end; number++) {
        const fullUrl = baseUrl + generation.generationString + '/' + padWithZeroes(number) + '.shtml';
        let html = await httpsGet(fullUrl, undefined, undefined, { "Accept-Charset": "utf-8" });
        html = correctHtml(html);
        //logHtml(html);
        const dom = parse(html);

        const name = getName(dom, number, generationNumber);
        //console.log(getName(dom, number));

        const data: { [key: string]: string } = {};

        let tableRow = getFirstRowOfLocationTable(dom, generationNumber);
        while (tableRow?.tagName === 'TR') {
            for (let game of generation.games) {
                let firstTD = tableRow.querySelector('td');
                if (game === 'Blue (Intl.)') {
                    firstTD = firstTD!.nextElementSibling;
                }
                if (firstTD?.innerText.trim() == game) {
                    const secondTD = firstTD.nextElementSibling;
                    //console.log(game + ", " + secondTD.innerText);
                    data[game] = secondTD.innerText.trim();
                    continue;
                }
            }
            tableRow = tableRow.nextElementSibling;
        }

        let outputLine = number + "|" + name;
        for (let game of generation.games) {
            outputLine += '|' + data[game];
        }
        console.log(
            outputLine.replace(/&eacute;/g, 'é')
                .replace(/&#9792;/g, '♀')
                .replace(/&#9794;/g, '♂')
                .replace(/�/g, 'é')
        );
    }
}

main();

function correctHtml(html: string) {
    return html.replace(/<\/td>\s*<tr>/g, '</td></tr><tr>')
        .replace(/<\/tr><\/tr>/g, '<\/tr>');
}

function logHtml(html: string) {
    let output = '';
    let linesToPrint = 0;
    for (let string of html.split('\n')) {

        if (string.includes('<b>Location</b>')) {
            linesToPrint = 50;
        }
        if (linesToPrint > 0) {
            output += string + '\n';
        }

    }
    console.log(output);
}

function getFirstRowOfLocationTable(dom: HTMLElement, generationNumber: number) {
    if (generationNumber <= 2) {
        return dom.querySelector('tr > td:contains("Location")')?.parentNode.nextElementSibling;
    } else if (generationNumber == 5) {
        return dom.querySelector('tr > td:contains("Locations")')?.parentNode.nextElementSibling;

    } else {
        return dom.querySelector('tr > td > b:contains("Location")')?.parentNode.parentNode.nextElementSibling.nextElementSibling;
    }
}

function getName(dom: HTMLElement, number: number, generation: number) {
    const text = dom.querySelector('title:contains("#' + padWithZeroes(number) + '")')?.innerText
    if (generation == 5) {
        const match = text?.match(new RegExp('(.*) - #' + padWithZeroes(number) + ' .*'));
        if (match) {
            return match[1];
        } else {
            return '';
        }
    } else {
        const match = text?.match(new RegExp('#' + padWithZeroes(number) + ' .*'));
        if (match) {
            return match[0];
        } else {
            return '';
        }
    }
}



function padWithZeroes(number: number) {
    let numberAsString = number + '';
    while (numberAsString.length < 3) {
        numberAsString = '0' + numberAsString
    }
    return numberAsString;
}

interface Generation {
    start: number
    end: number
    generationString: string
    games: string[]
}