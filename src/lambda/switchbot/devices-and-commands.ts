export const KNOWN_DEVICES = [
    'Blu Ray Player',
    'TV',
    'Box'
];

const DEVICE_SYNONYMS: { [k: string]: string } = {
    'blu ray': 'Blu Ray Player',
};

export const KNOWN_COMMANDS = [
    'Stop',
    'Previous',
    'Next',
    'Rewind',
    'FastForward',
    'setMute',
    'Pause',
    'Play',
    'volumeAdd',
    'volumeSub',
    'turnOff',
    'turnOn',
];

const COMMAND_SYNONYMS: { [k: string]: string } = {
    'volumeup': 'volumeAdd',
    'volumeincrease': 'volumeAdd',
    'volumedown': 'volumeSub',
    'volumedecrease': 'volumeSub',
    'mute': 'setMute',
    'on': 'turnOn',
    'off': 'turnOff',
};



// simple normalize: lowercase and remove spaces
function normalizeSimple(s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, '');
}

function findByNormalized(input: string, candidates: string[]) {
    const n = normalizeSimple(input);
    // exact case-insensitive
    for (const c of candidates) if (c.toLowerCase() === input.toLowerCase()) return c;
    // normalized match (ignoring spaces)
    for (const c of candidates) if (normalizeSimple(c) === n) return c;
    // substring (normalized)
    for (const c of candidates) {
        const nc = normalizeSimple(c);
        if (nc.includes(n) || n.includes(nc)) return c;
    }
    return undefined;
}

export function matchDevice(input?: string): string | undefined {
    if (!input) return undefined;
    const key = normalizeSimple(input);
    if (DEVICE_SYNONYMS[key]) return DEVICE_SYNONYMS[key];
    return findByNormalized(input, KNOWN_DEVICES);
}

export function matchCommand(input?: string): string | undefined {
    if (!input) return undefined;
    // check synonyms first
    const key = normalizeSimple(input);
    if (COMMAND_SYNONYMS[key]) return COMMAND_SYNONYMS[key];
    return findByNormalized(input, KNOWN_COMMANDS);
}
