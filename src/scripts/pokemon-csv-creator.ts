import { httpsGet } from "../lambda/http";

import { parse, HTMLElement } from 'node-html-parser';


const baseUrl = 'https://www.serebii.net/';
const generationNumber = 4;
const generations = {
    1: {
        start: 1,
        end: 151,
        generationString: 'pokedex'
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
    }
}
const generation = generations[generationNumber];


async function main() {

    for (let number = generation.start; number <= generation.end; number++) {
        const fullUrl = baseUrl + generation.generationString + '/' + padWithZeroes(number) + '.shtml';
        let html = await httpsGet(fullUrl);
        html = correctHtml(html);
        //logHtml(html);
        const dom = parse(html);

        const name = getName(dom, number);
        //console.log(getName(dom, number));

        const data: { [key: string]: string } = {};

        let tableRow = getFirstRowOfLocationTable(dom);
        while (tableRow?.tagName === 'TR') {
            for (let game of generation.games) {
                const firstTD = tableRow.querySelector('td');
                if (firstTD?.innerText.includes(game)) {
                    const secondTD = firstTD.nextElementSibling;
                    //console.log(game + ", " + secondTD.innerText);
                    data[game] = secondTD.innerText.trim();
                    continue;
                }
            }
            tableRow = tableRow.nextElementSibling;
        }

        let outputLine = name;
        for (let game of generation.games) {
            outputLine += '|' + data[game];
        }
        console.log(outputLine);
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

function getFirstRowOfLocationTable(dom: HTMLElement) {
    return dom.querySelector('tr > td > b:contains("Location")')?.parentNode.parentNode.nextElementSibling.nextElementSibling;
}

function getName(dom: HTMLElement, number: number) {
    const text = dom.querySelector('title:contains("#' + padWithZeroes(number) + '")')?.innerText
    const match = text?.match(new RegExp('#' + padWithZeroes(number) + ' .*'));
    if (match) {
        return match[0];
    } else {
        return '';
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