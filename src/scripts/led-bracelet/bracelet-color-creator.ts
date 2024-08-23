import fs, { write } from 'node:fs';

// Static for Flipper Zero file format
const maxRawDataEntries = 90;
const maxRawDataColumn = 500;
const writeToFiles = true;
const outputDir = '/home/nortakales/workspace/cron-lambdas/output/';
const frequency = '433920000';
const preset = "FuriHalSubGhzPresetOok650Async";

const max = 255;

const mainPrefix = [620, -5440, 620, -220, 620, -1251];
const midPrefix = [620, -1251];
const bitToSub: { [key: number]: number[] } = {
    0: [620, -220],
    1: [220, -620]
}
const fileName = 'test-purple-210-unknown';
const byteToIterate = -1;
const singleCommandRepeat = 25;
const byteDecimalValues = [
    170,
    255,
    255, // red
    0, // green
    255, // blue
    210, // either 170 (total 255) or 85 (no total?)
    255 // if 85 above, this should be red, otherwise 0
]

// dim green
//  83 172   0 170  83
// light blue
//   0 192  63 170   0
// seafoam
// 208 255  47  85 208

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

function printHeader() {
    output("Filetype: Flipper SubGhz RAW File");
    output("Version: 1");
    output("Frequency: " + frequency);
    output("Preset: " + preset);
    output("Protocol: RAW");
}

function convertCodeToData(code: number[]) {
    const data = [];
    for (let digit of code) {
        data.push(bitToSub[digit]);
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


function printBruteForce(byteToChange: number) {
    printHeader();

    let byteDataValues = [];
    for (let byte = 0; byte < byteDecimalValues.length; byte++) {
        byteDataValues[byte] = convertCodeToData(decimalNumberToBaseString(byteDecimalValues[byte], 2, 8).split('').map(Number));
    }

    for (let decimalValue = 0; decimalValue < max; decimalValue++) {

        if (byteToIterate >= 0) {
            byteDataValues[byteToIterate] = convertCodeToData(decimalNumberToBaseString(decimalValue, 2, 8).split('').map(Number));
        }

        let data = [];
        data.push(...mainPrefix);
        for (let byte of byteDataValues) {
            for (let bit of byte) {
                data.push(...bit);
            }
        }
        data.push(...midPrefix)
        for (let byte of byteDataValues) {
            for (let bit of byte) {
                data.push(...bit);
            }
        }

        printRawData(data);

        if (byteToIterate < 0 && decimalValue >= singleCommandRepeat) {
            break;
        }
    }
    output("\n");
    outputContentToFile(outputDir + fileName + ".sub");
}

function decimalNumberToBaseString(commandNumber: number, base: number, length: number) {
    return padWithZeros(commandNumber.toString(base), length);
}

function padWithZeros(binaryString: string, length: number) {
    const zerosToAdd = length - binaryString.length;
    for (let zeroCount = 0; zeroCount < zerosToAdd; zeroCount++) {
        binaryString = '0' + binaryString;
    }
    return binaryString;
}

printBruteForce(byteToIterate);