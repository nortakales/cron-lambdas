import fs, { write } from 'node:fs';

// Static for Flipper Zero file format
const maxRawDataEntries = 90;
const maxRawDataColumn = 500;
const batchSizeForBruteForce = 3;
const bruteForceSkipKnownCodes = true;
const writeToFiles = true;
const outputDir = '/home/nortakales/workspace/cron-lambdas/output/';

interface Protocol {
    frequency: number
    preset: string
    bitsToRandomize: number
    base: number
    pulseLength: number
    silenceLength: number[]
    repeatCommand: number
    broadcastPrefix: number[] // Applied once
    commandPrefix: number[]
    prefixCode: number[]
    suffixCode: number[]
    commandSuffix: number[]
    broadcastSuffix: number[]
    knownCodes: KnownCode[]
}

interface KnownCode {
    comment: string,
    code: number[]
}


const walgreens: Protocol = {
    frequency: 303875000,
    preset: "FuriHalSubGhzPresetOok270Async",
    bitsToRandomize: 7,
    base: 3,
    pulseLength: 1196,
    silenceLength: [
        -1945,
        -4864,
        -7759
    ],
    repeatCommand: 5,
    broadcastPrefix: [470000],
    commandPrefix: [-10660, 1196],
    prefixCode: [1, 1, 0, 1, 1, 2, 1, 0],
    suffixCode: [0, 1, 1, 1, 2],
    commandSuffix: [],
    broadcastSuffix: [-200000],
    knownCodes: [
        {
            comment: "Cough",
            code: [1, 1, 2, 0, 2, 0, 2]
        },
        {
            comment: "Dental",
            code: [2, 0, 2, 0, 2, 0, 2]
        },
        {
            comment: "Family Planning",
            code: [2, 1, 0, 1, 2, 0, 2]
        },
        {
            comment: "Pain Sleep",
            code: [2, 1, 1, 0, 1, 2, 1]
        },
        {
            comment: "Shave",
            code: [1, 1, 1, 2, 0, 2, 1]
        },
        {
            comment: "Skin Care",
            code: [2, 0, 1, 1, 2, 1, 1]
        },
        {
            comment: "Vitamin",
            code: [2, 1, 0, 1, 2, 1, 1]
        }

    ]
}

const walgreensBinary: Protocol = {
    frequency: 303875000,
    preset: "FuriHalSubGhzPresetOok270Async",
    bitsToRandomize: 6,
    base: 2,
    pulseLength: 1196,
    silenceLength: [
        -1945,
        -7759
    ],
    repeatCommand: 5,
    broadcastPrefix: [470000],
    commandPrefix: [-10660, 1196, -4864, 1196, -4864, 1196],
    prefixCode: [0, 0, 0, 1, 1, 0],
    suffixCode: [1, 0, 0, 0, 0, 1],
    commandSuffix: [],
    broadcastSuffix: [-200000],
    knownCodes: [
        {
            comment: "Cough",
            code: [0, 0, 1, 0, 1, 0]
        },
        {
            comment: "Dental",
            code: [1, 0, 1, 0, 1, 0]
        },
        {
            comment: "Family Planning",
            code: [1, 1, 0, 0, 1, 0]
        },
        {
            comment: "Pain Sleep",
            code: [1, 1, 1, 0, 0, 1]
        },
        {
            comment: "Shave",
            code: [0, 0, 0, 1, 0, 1]
        },
        {
            comment: "Skin Care",
            code: [1, 0, 0, 0, 1, 1]
        },
        {
            comment: "Vitamin",
            code: [1, 1, 0, 0, 1, 1]
        }
    ]
}

const lowes: Protocol = {
    frequency: 303875000,
    preset: "FuriHalSubGhzPresetOok650Async",
    bitsToRandomize: 9,
    base: 3,
    pulseLength: 1081,
    silenceLength: [
        -1915,
        -4841,
        -7761
    ],
    repeatCommand: 5,
    broadcastPrefix: [740000],
    commandPrefix: [-10665, 1081],
    prefixCode: [1, 0, 1, 2, 0, 1, 2, 0],
    suffixCode: [1, 1, 2],
    commandSuffix: [],
    broadcastSuffix: [-180000],
    knownCodes: [
        {
            comment: "Appliance Desk",
            code: [1, 2, 0, 1, 1, 1, 1, 2, 0]
        },
        {
            comment: "Blind Cutting",
            code: [2, 0, 1, 1, 2, 0, 2, 0, 1]
        },
        {
            comment: "Electrical",
            code: [2, 0, 2, 0, 2, 0, 1, 1, 1]
        },
        {
            comment: "Flooring",
            code: [2, 1, 0, 1, 1, 1, 1, 2, 0]
        },
        {
            comment: "Outdoor Power Equipment",
            code: [1, 2, 1, 0, 2, 1, 1, 0, 1]
        },
        {
            comment: "Packaged Rugs",
            code: [1, 2, 0, 1, 2, 0, 1, 1, 1]
        },
        {
            comment: "Wirecutting",
            code: [2, 1, 0, 1, 1, 2, 0, 1, 1]
        }
    ]
}

const lowesBinary: Protocol = {
    frequency: 303875000,
    preset: "FuriHalSubGhzPresetOok650Async",
    bitsToRandomize: 8,
    base: 2,
    pulseLength: 1081,
    silenceLength: [
        -1915,
        -7761
    ],
    repeatCommand: 5,
    broadcastPrefix: [740000],
    commandPrefix: [-10665, 1081, -4841, 1081],
    prefixCode: [0, 0, 1, 0, 0, 1, 0],
    suffixCode: [0, 0, 0, 1],
    commandSuffix: [],
    broadcastSuffix: [-180000],
    knownCodes: [
        {
            comment: "Appliance Desk",
            code: [0, 1, 0, 0, 0, 0, 0, 1]
        },
        {
            comment: "Blind Cutting",
            code: [1, 0, 0, 0, 1, 0, 1, 0]
        },
        {
            comment: "Electrical",
            code: [1, 0, 1, 0, 1, 0, 0, 0]
        },
        {
            comment: "Flooring",
            code: [1, 1, 0, 0, 0, 0, 0, 1]
        },
        {
            comment: "Outdoor Power Equipment",
            code: [0, 1, 1, 0, 1, 1, 1, 0]
        },
        {
            comment: "Packaged Rugs",
            code: [0, 1, 0, 0, 1, 0, 0, 0]
        },
        {
            comment: "Wirecutting",
            code: [1, 1, 0, 0, 0, 1, 0, 0]
        }
    ]
}

let content = '';
function output(string: string) {
    if (writeToFiles) {
        content += string + "\n";
    } else {
        console.log(string);
    }
}
function outputContentToFile(filePath: string) {
    if (writeToFiles) {
        const contentCopy = content;
        content = '';
        fs.writeFile(filePath, contentCopy, (error) => {
            if (error) {
                console.log("Error writing file " + filePath);
            }
        });
    }
}

function printHeader(protocol: Protocol) {
    output("Filetype: Flipper SubGhz RAW File");
    output("Version: 1");
    output("Frequency: " + protocol.frequency);
    output("Preset: " + protocol.preset);
    output("Protocol: RAW");
}
function printComment(comment: string) {
    output("#");
    output("# " + comment);
    output("#");
}

function createRepeatedCommandFromCode(protocol: Protocol, code: number[]) {
    let singleCommand = createSingleCommandFromCode(protocol, code);
    let data: number[] = [];
    for (let repeat = 0; repeat < protocol.repeatCommand; repeat++) {
        data = data.concat(singleCommand);
    }
    return data;
}

function createSingleCommandFromCode(protocol: Protocol, code: number[]) {
    return protocol.commandPrefix
        .concat(convertCodeToData(protocol, protocol.prefixCode))
        .concat(convertCodeToData(protocol, code))
        .concat(convertCodeToData(protocol, protocol.suffixCode))
        .concat(protocol.commandSuffix);
}

function convertCodeToData(protocol: Protocol, code: number[]) {
    const data = [];
    for (let digit of code) {
        data.push(protocol.silenceLength[digit]);
        data.push(protocol.pulseLength);
    }
    return data;
}

function printRawData(data: number[]) {
    let currentLine = "RAW_Data:";
    let currentLineEntries = 0;
    for (let datum of data) {
        const datumString = ` ${datum}`;
        if (currentLine.length + datumString.length > maxRawDataColumn || ++currentLineEntries > maxRawDataEntries) {
            // Write the line and start a new one
            output(currentLine);
            currentLine = "RAW_Data:";
            currentLineEntries = 0;
        }
        currentLine += datumString;
    }
    // Print the last line left
    output(currentLine);
}

function printKnownCodes(protocol: Protocol) {
    for (const knownCode of protocol.knownCodes) {
        printComment(knownCode.comment);
        printHeader(protocol);
        printRawData(createRepeatedCommandFromCode(protocol, knownCode.code))
        output("\n");
    }
}

function printBruteForce(protocol: Protocol) {

    let batch = 0;

    const knownCodeStrings: { [key: string]: boolean } = {};
    if (bruteForceSkipKnownCodes) {
        for (let knownCode of protocol.knownCodes) {
            knownCodeStrings[knownCode.code.join('')] = true;
        }
    }

    const max = Math.pow(protocol.base, protocol.bitsToRandomize);
    for (let commandNumber = 0; commandNumber < max; commandNumber++) {

        if (commandNumber % batchSizeForBruteForce == 0) {
            output("\n");
            outputContentToFile(outputDir + batch++ + ".sub");


            //printComment("Batch " + batch);
            printHeader(protocol);
        }

        let commandString = commandNumberToBaseString(commandNumber, protocol.base, protocol.bitsToRandomize);
        if (bruteForceSkipKnownCodes && knownCodeStrings[commandString]) {
            console.log("Skipping " + commandNumber + " " + commandString);
            continue;
        }
        printRawData(createRepeatedCommandFromCode(protocol, commandString.split('').map(Number)));
    }
    output("\n");
    outputContentToFile(outputDir + batch++ + ".sub");
}

function commandNumberToBaseString(commandNumber: number, base: number, length: number) {
    return padWithZeros(commandNumber.toString(base), length);
}

function padWithZeros(binaryString: string, length: number) {
    const zerosToAdd = length - binaryString.length;
    for (let zeroCount = 0; zeroCount < zerosToAdd; zeroCount++) {
        binaryString = '0' + binaryString;
    }
    return binaryString;
}

//printKnownCodes(walgreensBinary);
printBruteForce(lowesBinary);