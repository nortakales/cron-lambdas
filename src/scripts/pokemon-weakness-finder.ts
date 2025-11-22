// Pokemon type list and effectiveness chart utilities
// Types are lower-cased for case-insensitive lookups
export const TYPES = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
    'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
] as const;

type Type = (typeof TYPES)[number];

// Effectiveness map: attackType -> (defenseType -> multiplier)
// Only non-1 values need to be listed; unspecified pairs default to 1
const EFFECTIVENESS: Record<string, Partial<Record<string, number>>> = {
    normal: { ghost: 0, rock: 0.5, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, fairy: 2, steel: 0.5 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

// Build the 2D array (attack rows x defense columns) using TYPES ordering
export const DAMAGE_CHART: number[][] = TYPES.map(att => {
    const row: number[] = TYPES.map(def => {
        const val = EFFECTIVENESS[att]?.[def];
        return val === undefined ? 1 : val;
    });
    return row;
});

function normalize(t: string): string {
    return t.trim().toLowerCase();
}

function typeIndex(t: string): number {
    const n = normalize(t);
    const idx = TYPES.indexOf(n as Type);
    if (idx === -1) throw new Error(`Unknown Pokemon type: ${t}`);
    return idx;
}

/**
 * Returns the total damage multiplier when an attack of `attackType` hits a defending
 * Pokemon with `defType` and optional `defType2`.
 * Example: getDamageMultiplier('fire', 'grass') -> 2
 */
export function getDamageMultiplier(attackType: string, defType: string, defType2?: string): number {
    const aIdx = typeIndex(attackType);
    const d1Idx = typeIndex(defType);
    const m1 = DAMAGE_CHART[aIdx][d1Idx];

    if (!defType2) return m1;

    const d2Idx = typeIndex(defType2);
    const m2 = DAMAGE_CHART[aIdx][d2Idx];

    return m1 * m2;
}

/**
 * Returns an array of multipliers for every attacking type (in `TYPES` order)
 * against a defender with `defType` and optional `defType2`.
 * Each element is { type, multiplier }.
 */
export function getAllMultipliers(defType: string, defType2?: string): { type: string; multiplier: number }[] {
    // Validate types early to provide clear errors
    typeIndex(defType);
    if (defType2) typeIndex(defType2);

    return TYPES.map(t => ({
        type: t,
        multiplier: getDamageMultiplier(t, defType, defType2)
    }));
}

// Example usage (uncomment for quick manual testing)

/**
 * Tally weaknesses across multiple Pokemon.
 * Each pokemon can be represented as a single type string or a tuple/array of two type strings.
 * Returns an array of { type, total } where `total` is the sum of multipliers from all pokemon
 * for that attacking type.
 */
export type PokemonDef = [string, string?];

export function tallyWeaknesses(pokemons: PokemonDef[]): { type: string; count: number }[] {
    // initialize counts to 0 for each attacking type
    const counts = new Array<number>(TYPES.length).fill(0);

    for (const p of pokemons) {
        const def1 = p[0];
        const def2 = p[1];

        // validate types (will throw for unknown types)
        typeIndex(def1);
        if (def2) typeIndex(def2);

        for (let i = 0; i < TYPES.length; i++) {
            const atk = TYPES[i];
            const mul = getDamageMultiplier(atk, def1, def2);
            if (mul > 1) counts[i] += 1;
        }
    }

    return TYPES.map((t, i) => ({ type: t, count: counts[i] }));
}

// console.log(getDamageMultiplier('fire', 'grass')); // 2
// console.log(getDamageMultiplier('electric', 'water', 'flying')); // 4 (2 * 2)
// console.log(getAllMultipliers('rock'));


const team = [
    ['bug', 'flying'],
    ['ice', 'psychic'],
    ['fire'],
    ['normal'],
    ['water', 'ice'],
    ['normal', 'flying'],
    ['fighting'],
    ['fire'],
    ['bug'],
    ['water'],
    ['fighting'],
    ['electric'],
    ['normal'],
    ['dragon', 'flying'],
    ['fire'],
    ['poison'],
    ['ground'],
    ['poison', 'ground'],
    ['poison', 'ground'],
    ['ground'],
    ['rock', 'ground'],
    ['water'],
    ['water', 'psychic'],
    ['poison'],
    ['water', 'poison'],
    ['fire'],
    ['normal'],
    ['rock', 'water'],
    ['ghost', 'poison'],
    ['electric'],
    ['grass', 'poison'],
    ['electric'],
    ['grass', 'poison'],
    ['psychic'],
    ['water', 'ice'],
    ['normal'],
    ['ice', 'flying'],
    ['fire', 'flying'],
    ['fire', 'flying'],
    ['water', 'flying'],
    ['electric', 'flying'],
    ['rock', 'flying'],
    ['psychic'],
    ['normal'],
    ['water', 'psychic'],
    ['ground', 'rock'],
    ['grass', 'psychic'],
    ['electric']
].map(t => t as PokemonDef);

const sorted = tallyWeaknesses(team).sort((a, b) => b.count - a.count);

console.log('Weaknesses sorted (most -> least):');
for (const entry of sorted) {
    console.log(`${entry.type}: ${entry.count}`);
}




/*

ground: 17
rock: 17
electric: 15
ice: 14
water: 13
grass: 11
fighting: 10
psychic: 10
fire: 7
flying: 7
ghost: 7
dark: 7
bug: 6
steel: 5
fairy: 3
poison: 1
dragon: 1
normal: 0

Mewtwo
 Psychic
 Recover
 Amnesia
 Ice Beam/Blizzard
Solar Beam
Thunderbolt/Thunder
Fire Blast

Mew
 Psychic
Ice Beam/Blizzard
Solar Beam
Thunderbolt/Thunder
 Earthquake/Dig
Fire Blast
 Rock Slide
 Fly
Surf

Dragonite
Ice Beam/Blizzard
Thunderbolt/Thunder
Fire Blast
Surf


*/