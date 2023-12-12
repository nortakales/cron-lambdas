import { httpsGet } from "../lambda/http";

import { parse, HTMLElement } from 'node-html-parser';


const baseUrl = 'https://brickset.com/api/v3.asmx';
const resource = 'getSets';
const apiKey = '3-sldm-i48r-DrVD4';
const userHash = 'EStkMHtXwn';
const sets = [
    7674,
    // 7877,
    // 7879,
    // 7962,
    // 7965,
    // 8089,
    // 8092,
    // 8097,
    // 9492,
    // 9493,
    // 9495,
    // 10174,
    // 10225,
    // 10240,
    // 10242,
    // 10258,
    // 10262,
    // 10300,
    // 10306,
    // 10309,
    // 21103,
    // 21108,
    // 21302,
    // 21303,
    // 21313,
    // 21314,
    // 21318,
    // 21322,
    // 21325,

    // 21331,
    // 21335,
    // 30358,
    // 30385,
    // 30495,
    // 30550,
    // 30611,
    // 30611,
    // 30654,
    // 40109,
    // 40176,
    // 40201,
    // 40220,
    // 40254,
    // 40288,
    // 40288,
    // 40300,
    // 40333,
    // 40362,
    // 40407,
    // 40417,
    // 40449,

    // 40451,
    // 40487,
    // 40496,
    // 40496,
    // 40512,
    // 40513,
    // 40515,
    // 40521,
    // 40531,
    // 40539,
    // 40549,
    // 40552,
    // 40560,
    // 40591,
    // 40597,
    // 40606,
    // 40608,
    // 40615,
    // 40619,
    // 40621,
    // 40623,
    // 41485,
    // 41486,
    // 41585,
    // 41587,
    // 41588,
    // 41589,
    // 41590,
    // 41592,
    // 41593,
    // 41602,
    // 41603,
    // 41605,
    // 41606,
    // 41607,
    // 41608,
    // 41609,
    // 41611,
    // 41614,
    // 41615,
    // 41619,
    // 41620,
    // 41621,
    // 41622,
    // 41626,
    // 41627,
    // 41628,
    // 41629,

    // 42110,
    // 42111,
    // 71374,
    // 71395,
    // 75020,
    // 75035,
    // 75048,
    // 75050,
    // 75053,
    // 75054,
    // 75055,
    // 75059,
    // 75060,
    // 75083,
    // 75087,
    // 75094,
    // 75095,
    // 75096,
    // 75099,
    // 75102,
    // 75104,
    // 75135,
    // 75136,
    // 75140,
    // 75144,
    // 75149,
    // 75150,
    // 75153,
    // 75154,

    // 75155,
    // 75156,
    // 75157,
    // 75158,
    // 75168,
    // 75170,
    // 75175,
    // 75176,
    // 75178,
    // 75179,
    // 75181,
    // 75187,
    // 75188,
    // 75191,
    // 75192,
    // 75199,
    // 75202,
    // 75209,
    // 75210,
    // 75212,
    // 75215,
    // 75217,
    // 75219,
    // 75232,
    // 75233,
    // 75240,
    // 75242,
    // 75244,
    // 75248,
    // 75252,
    // 75254,
    // 75256,
    // 75272,

    // 75273,
    // 75274,
    // 75275,
    // 75276,
    // 75277,
    // 75278,
    // 75281,
    // 75283,
    // 75284,
    // 75292,
    // 75293,
    // 75294,
    // 75304,
    // 75305,
    // 75306,
    // 75309,
    // 75317,
    // 75325,
    // 75327,
    // 75328,
    // 75329,
    // 75330,
    // 75331,
    // 75335,
    // 75339,
    // 75341,
    // 75343,
    // 75533,
    // 75810,
    // 75894,
    // 75902,
    // 75964,
    // 75973,
    // 75974,
    // 75976,
    // 75979,
    // 76178,
    // 76383,
    // 76392,
    // 76394,

    // 854124,
    // 5002948,
    // 5004932,
    // 5005359,
    // 5007029,
    // 5007403,
    // 5007840,
    // 40632,
    // 40630,
    // 76956,
    // 7958,
    // 5005249,
    // 850998,
    // 5005587,
    // 5002947,
    // 75184,
];

// TODO a better way to loop through all the sets, remove dupes

const params = {
    setNumber: sets.join('-1,') + '-1' // -3 for 75188
};

const queryString = `apiKey=${apiKey}&userHash=${userHash}&params=${encodeURIComponent(JSON.stringify(params))}`;
const constructedUrl = `${baseUrl}/${resource}?${queryString}`;

main();

async function main() {

    const body = await httpsGet(constructedUrl);
    const setList: GetSetsResponse = JSON.parse(body);
    if (setList.matches <= 1) {
        console.log(body);
    }
    if (setList.matches !== sets.length) {
        console.log("WARNING: did not get all sets");
    }
    console.log('Set Number,Price')
    setList.sets.forEach(set => {
        console.log([set.number, set.LEGOCom.US.retailPrice].join(','));
    });
}

interface GetSetsResponse {
    status: string,
    matches: number,
    sets: Set[]
}
interface Set {
    number: string,
    numberVariant: number,
    name: string,
    year: number,
    theme: string,
    themeGroup: string,
    subTheme: string,
    category: string,
    pieces: number,
    minifigs: number,
    LEGOCom: RetailInfo,
    packagingType: string
}
interface RetailInfo {
    US: CountryRetailInfo
}
interface CountryRetailInfo {
    retailPrice: number,
    dateFirstAvailable: string
    dateLastAvailable: string
}