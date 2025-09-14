import * as SM from '../../secrets';
import { httpsGet } from '../../http';

// Documentation: https://brickset.com/article/52664/api-version-3-documentation

const BASE_URL = 'https://brickset.com/api/v3.asmx/';

const CREDENTIALS_BRICKSET = process.env.CREDENTIALS_BRICKSET!;

interface BricksetLoginResponse {
    status: string;
    hash: string;
}

interface BricketSetResponse {
    status: string;
    matches: number;
    sets: BricksetSet[];
}

interface BricksetSet {
    setID: number;
    number: string;
    numberVariant: number;
    name: string;
    year: number;
    theme: string;
    subtheme: string;
    category: string;
    released: boolean;
    launchDate: string;
    exitDate: string;
    image: BricketSetImages;
    bricksetURL: string;
    availability: string;
    lastUpdated: string;
    LEGOCom: { [key: string]: BricksetLegoDotComDetails };
}

interface BricketSetImages {
    thumbnailURL: string;
    imageURL: string;
}

interface BricksetLegoDotComDetails {
    retailPrice: number;
    dateFirstAvailable: string;
    dateLastAvailable: string;
}

let userHashCache: string | undefined = undefined;
async function login() {
    if (userHashCache) {
        return userHashCache;
    } else {
        userHashCache = await forceLogin();
        return userHashCache;
    }
}

async function forceLogin() {
    console.log("Logging into Brickset to get userHash");
    const credentials = await SM.getSecretObject(CREDENTIALS_BRICKSET);

    const loginUrl = `${BASE_URL}login?apiKey=${credentials.apiKey}&username=${credentials.username}&password=${credentials.password}`;
    const loginJson = await httpsGet(loginUrl);
    const loginData: BricksetLoginResponse = JSON.parse(loginJson);

    if (loginData.status !== 'success') {
        throw new Error(`Brickset login failed with status ${loginData.status}`);
    }

    return loginData.hash;
}

export async function getSet(setNumber: string) {

    const userHash = await login();
    const credentials = await SM.getSecretObject(CREDENTIALS_BRICKSET);

    if (setNumber.indexOf('-') === -1) {
        setNumber = setNumber + '-1';
    }
    const setUrl = `${BASE_URL}getSets?apiKey=${credentials.apiKey}&userHash=${userHash}&params={'setNumber':'${setNumber}'}`;
    const setJson = await httpsGet(setUrl);
    const setData: BricketSetResponse = JSON.parse(setJson);

    if (setData.status !== 'success') {
        throw new Error(`Brickset getSets failed with status ${setData.status}`);
    }

    // TODO attempt to re-login based on status?

    if (setData.matches !== 1) {
        throw new Error(`Brickset getSets returned ${setData.matches} matches for set number ${setNumber}, should be 1`);
    }

    return setData.sets[0];
}