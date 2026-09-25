// Weather conditions (the "icon" you'd normally see), normalized across sources and aggregated with a two-step vote.
// See docs/weather-alert-system.md "Weather conditions".
//
// Only conditions a source actually provides are used, nothing is derived from other metrics (e.g. NWS isn't used, since
// it has no condition, only sky cover % and precipitation). Codes that don't fit the list (windy, hot, cold, haze,
// smoke, dust, squalls, unknown) return undefined, so that source just doesn't vote for that hour/day.

export const SKY_CONDITIONS = ['clear', 'mostly_clear', 'partly_cloudy', 'mostly_cloudy', 'cloudy'] as const;
export const RAIN_CONDITIONS = ['drizzle', 'light_rain', 'rain', 'heavy_rain'] as const;
export const CONDITIONS = [...SKY_CONDITIONS, 'fog', ...RAIN_CONDITIONS, 'thunderstorm', 'snow', 'sleet'] as const;

export type Condition = typeof CONDITIONS[number];

const PRECIPITATION: Condition[] = [...RAIN_CONDITIONS, 'thunderstorm', 'snow', 'sleet'];

const unmapped = new Set<string>();
function logUnmapped(source: string, code: string | number | undefined) {
    const key = `${source}:${code}`;
    if (code != null && !unmapped.has(key)) {
        unmapped.add(key);
        console.log(`Unmapped weather condition from ${source}: ${code}`);
    }
}

// Open-Meteo `weather_code`: WMO codes. https://open-meteo.com/en/docs (WMO Weather interpretation codes)
export function fromWmoCode(code: number | null | undefined): Condition | undefined {
    if (code == null) return undefined;
    switch (code) {
        case 0: return 'clear';
        case 1: return 'mostly_clear';
        case 2: return 'partly_cloudy';
        case 3: return 'cloudy';
        case 45: case 48: return 'fog';
        case 51: case 53: case 55: return 'drizzle';
        case 56: case 57: return 'sleet'; // freezing drizzle
        case 61: case 80: return 'light_rain'; // slight rain / slight rain showers
        case 63: case 81: return 'rain';
        case 65: case 82: return 'heavy_rain';
        case 66: case 67: return 'sleet'; // freezing rain
        case 71: case 73: case 75: case 77: case 85: case 86: return 'snow';
        case 95: case 96: case 99: return 'thunderstorm';
    }
    logUnmapped('WMO', code);
    return undefined;
}

// OpenWeather `weather[0].id`. https://openweathermap.org/weather-conditions
export function fromOpenWeatherId(id: number | null | undefined): Condition | undefined {
    if (id == null) return undefined;
    if (id >= 200 && id < 300) return 'thunderstorm';
    if (id >= 300 && id < 400) return 'drizzle';
    switch (id) {
        case 500: case 520: return 'light_rain';
        case 501: case 521: case 531: return 'rain';
        case 502: case 503: case 504: case 522: return 'heavy_rain';
        case 511: return 'sleet'; // freezing rain
        case 611: case 612: case 613: case 615: case 616: return 'sleet'; // sleet, rain and snow
        case 600: case 601: case 602: case 620: case 621: case 622: return 'snow';
        case 701: case 741: return 'fog'; // mist, fog
        case 781: return 'thunderstorm'; // tornado
        case 800: return 'clear';
        case 801: return 'mostly_clear'; // few clouds 11-25%
        case 802: return 'partly_cloudy'; // scattered clouds 25-50%
        case 803: return 'mostly_cloudy'; // broken clouds 51-84%
        case 804: return 'cloudy'; // overcast
    }
    // 711 smoke, 721 haze, 731/761 dust, 751 sand, 762 ash, 771 squalls
    logUnmapped('OpenWeather', id);
    return undefined;
}

// Tomorrow.io `weatherCode` (4 digits) or `weatherCodeDay`/`weatherCodeNight` (5 digits: a 4-digit code + a trailing
// 0 for day / 1 for night). Many 4-digit codes only appear in the 5-digit variants, e.g. 4214 "Partly Cloudy and Light
// Rain". https://docs.tomorrow.io/reference/data-layers-weather-codes
export function fromTomorrowIoCode(code: number | null | undefined): Condition | undefined {
    if (code == null || code === 0) return undefined;
    const base = code >= 10000 ? Math.floor(code / 10) : code;
    switch (base) {
        case 1000: return 'clear';
        case 1100: return 'mostly_clear';
        case 1101: case 1103: return 'partly_cloudy'; // 1103 "Partly Cloudy and Mostly Clear"
        case 1102: return 'mostly_cloudy';
        case 1001: return 'cloudy';
        case 4000: case 4203: case 4204: case 4205: return 'drizzle';
        case 4200: case 4213: case 4214: case 4215: return 'light_rain';
        case 4001: case 4208: case 4209: case 4210: return 'rain';
        case 4201: case 4202: case 4211: case 4212: return 'heavy_rain';
        case 5108: case 5110: case 5112: case 5114: return 'sleet'; // rain and snow, drizzle and snow, snow and ice pellets/freezing rain
        case 8000: return 'thunderstorm';
    }
    switch (Math.floor(base / 1000)) {
        case 2: return 'fog'; // 2000 fog, 2100 light fog, and "... and fog" variants
        case 5: return 'snow';
        case 6: case 7: return 'sleet'; // freezing drizzle/rain, ice pellets
        case 8: return 'thunderstorm';
    }
    logUnmapped('Tomorrow.io', code);
    return undefined;
}

// AccuWeather `WeatherIcon` / `Day.Icon` (1-44). https://developer.accuweather.com/weather-icons
export function fromAccuWeatherIcon(icon: number | null | undefined): Condition | undefined {
    if (icon == null) return undefined;
    switch (icon) {
        case 1: case 33: return 'clear'; // sunny, clear
        case 2: case 34: return 'mostly_clear'; // mostly sunny, mostly clear
        case 5: case 37: return 'mostly_clear'; // hazy sunshine, hazy moonlight
        case 3: case 4: case 35: case 36: return 'partly_cloudy'; // partly sunny, intermittent clouds, partly cloudy
        case 6: case 38: return 'mostly_cloudy';
        case 7: case 8: return 'cloudy'; // cloudy, dreary (overcast)
        case 11: return 'fog';
        case 12: case 13: case 14: case 18: case 39: case 40: return 'rain'; // showers, rain
        case 15: case 16: case 17: case 41: case 42: return 'thunderstorm';
        case 19: case 20: case 21: case 22: case 23: case 43: case 44: return 'snow'; // flurries, snow
        case 24: case 25: case 26: case 29: return 'sleet'; // ice, sleet, freezing rain, rain and snow
    }
    // 30 hot, 31 cold, 32 windy
    logUnmapped('AccuWeather', icon);
    return undefined;
}

// Google Weather `weatherCondition.type`. https://developers.google.com/maps/documentation/weather/weather-condition-icons
export function fromGoogleType(type: string | null | undefined): Condition | undefined {
    if (type == null) return undefined;
    switch (type) {
        case 'CLEAR': return 'clear';
        case 'MOSTLY_CLEAR': return 'mostly_clear';
        case 'PARTLY_CLOUDY': return 'partly_cloudy';
        case 'MOSTLY_CLOUDY': return 'mostly_cloudy';
        case 'CLOUDY': return 'cloudy';
        case 'LIGHT_RAIN_SHOWERS': case 'CHANCE_OF_SHOWERS': case 'SCATTERED_SHOWERS':
        case 'LIGHT_TO_MODERATE_RAIN': case 'LIGHT_RAIN':
            return 'light_rain';
        case 'RAIN_SHOWERS': case 'MODERATE_TO_HEAVY_RAIN': case 'RAIN': case 'WIND_AND_RAIN':
            return 'rain';
        case 'HEAVY_RAIN_SHOWERS': case 'HEAVY_RAIN': case 'RAIN_PERIODICALLY_HEAVY':
            return 'heavy_rain';
        case 'LIGHT_SNOW_SHOWERS': case 'CHANCE_OF_SNOW_SHOWERS': case 'SCATTERED_SNOW_SHOWERS': case 'SNOW_SHOWERS':
        case 'HEAVY_SNOW_SHOWERS': case 'LIGHT_TO_MODERATE_SNOW': case 'MODERATE_TO_HEAVY_SNOW': case 'SNOW':
        case 'LIGHT_SNOW': case 'HEAVY_SNOW': case 'SNOWSTORM': case 'SNOW_PERIODICALLY_HEAVY': case 'HEAVY_SNOW_STORM':
        case 'BLOWING_SNOW':
            return 'snow';
        case 'RAIN_AND_SNOW': case 'HAIL': case 'HAIL_SHOWERS':
            return 'sleet';
        case 'THUNDERSTORM': case 'THUNDERSHOWER': case 'LIGHT_THUNDERSTORM_RAIN': case 'SCATTERED_THUNDERSTORMS':
        case 'HEAVY_THUNDERSTORM':
            return 'thunderstorm';
    }
    // WINDY, TYPE_UNSPECIFIED
    logUnmapped('Google', type);
    return undefined;
}

// Pirate Weather `icon`, requested with icon=pirate for the expanded set (e.g. mostly-clear-day, light-rain,
// possible-rain-day). https://docs.pirateweather.net/en/latest/API/
export function fromPirateWeatherIcon(icon: string | null | undefined): Condition | undefined {
    if (icon == null) return undefined;
    let base = icon.replace(/-(day|night)$/, '');
    // "possible-rain" etc. is what Pirate Weather shows for a chance of precipitation: a light version of that type
    if (base.startsWith('possible-')) {
        base = { 'possible-rain': 'light-rain', 'possible-precipitation': 'light-rain' }[base] ?? base.replace('possible-', '');
    }
    switch (base) {
        case 'clear': return 'clear';
        case 'mostly-clear': return 'mostly_clear';
        case 'partly-cloudy': return 'partly_cloudy';
        case 'mostly-cloudy': return 'mostly_cloudy';
        case 'cloudy': return 'cloudy';
        case 'fog': return 'fog';
        case 'drizzle': return 'drizzle';
        case 'light-rain': return 'light_rain';
        case 'rain': case 'precipitation': return 'rain';
        case 'heavy-rain': return 'heavy_rain';
        case 'snow': case 'light-snow': case 'heavy-snow': case 'flurries': return 'snow';
        case 'sleet': case 'freezing-rain': case 'freezing-drizzle': case 'hail': case 'ice': case 'mixed': return 'sleet';
        case 'thunderstorm': return 'thunderstorm';
    }
    // wind, breezy, dangerous-wind, haze, smoke, ...
    logUnmapped('Pirate Weather', icon);
    return undefined;
}

// Visual Crossing `conditions` text, a comma-separated list such as "Rain, Overcast" or "Partially cloudy".
// Precipitation takes priority over sky cover. https://www.visualcrossing.com/resources/documentation/weather-api/weather-condition-fields/
export function fromVisualCrossingConditions(text: string | null | undefined): Condition | undefined {
    if (text == null || text.trim() === '') return undefined;
    const t = text.toLowerCase();
    if (t.includes('thunderstorm') || t.includes('tornado')) return 'thunderstorm';
    if (t.includes('freezing') || t.includes('ice') || t.includes('hail') || t.includes('sleet') ||
        (t.includes('rain') && t.includes('snow'))) return 'sleet';
    if (t.includes('snow')) return 'snow';
    if (t.includes('drizzle')) return 'drizzle';
    if (t.includes('heavy rain')) return 'heavy_rain';
    if (t.includes('light rain')) return 'light_rain';
    if (t.includes('rain')) return 'rain';
    if (t.includes('fog') || t.includes('mist')) return 'fog';
    if (t.includes('overcast')) return 'cloudy';
    if (t.includes('partially cloudy')) return 'partly_cloudy';
    if (t.includes('clear')) return 'clear';
    logUnmapped('Visual Crossing', text);
    return undefined;
}

export interface ConditionResult {
    value: Condition;
    agreement: number; // share of voting sources whose condition equals value exactly (0 to 1)
    n: number; // number of sources that voted
    votes: { [condition: string]: number };
}

// Median on an ordered scale. With an even count, the two middle positions are averaged and rounded up (toward the
// cloudier/heavier end), e.g. 3 "clear" + 3 "cloudy" -> "partly_cloudy".
function scaleMedian<T>(values: T[], scale: readonly T[]): T {
    const positions = values.map(value => scale.indexOf(value)).sort((a, b) => a - b);
    const middle = positions.length / 2;
    const position = positions.length % 2 === 1
        ? positions[Math.floor(middle)]
        : Math.round((positions[middle - 1] + positions[middle]) / 2);
    return scale[position];
}

// Two-step vote:
// 1. If a strict majority of sources report precipitation, pick the type by plurality (ties: thunderstorm > sleet >
//    snow > rain), and for rain the intensity is the median of the rain votes on the drizzle -> heavy_rain scale.
// 2. Otherwise fog wins if it has at least as many votes as any single sky condition; if not, the result is the
//    median of the sky conditions on the clear -> cloudy scale. Minority precipitation votes count as "cloudy"
//    there, since the sources reporting them expect clouds.
export function aggregateConditions(conditionsBySource: { [source: string]: Condition }): ConditionResult | undefined {
    const values = Object.values(conditionsBySource);
    const n = values.length;
    if (n === 0) {
        return undefined;
    }

    const votes: { [condition: string]: number } = {};
    for (let value of values) {
        votes[value] = (votes[value] || 0) + 1;
    }

    let value: Condition;
    const precipitation = values.filter(value => PRECIPITATION.includes(value));

    if (precipitation.length * 2 > n) {
        const rain = precipitation.filter(value => (RAIN_CONDITIONS as readonly string[]).includes(value));
        const typeCounts: [Condition, number][] = [
            ['thunderstorm', votes['thunderstorm'] || 0],
            ['sleet', votes['sleet'] || 0],
            ['snow', votes['snow'] || 0],
            ['rain', rain.length]
        ];
        // Stable sort keeps the tie-break priority order above
        const [type] = [...typeCounts].sort((a, b) => b[1] - a[1])[0];
        if (type === 'rain') {
            value = scaleMedian(rain, RAIN_CONDITIONS as readonly Condition[]);
        } else {
            value = type;
        }
    } else {
        const fog = votes['fog'] || 0;
        const maxSky = Math.max(0, ...SKY_CONDITIONS.map(sky => votes[sky] || 0));
        const sky = values
            .filter(value => value !== 'fog')
            .map(value => PRECIPITATION.includes(value) ? 'cloudy' : value);
        value = (fog > 0 && fog >= maxSky) || sky.length === 0 ? 'fog' : scaleMedian(sky, SKY_CONDITIONS as readonly Condition[]);
    }

    return {
        value,
        agreement: (votes[value] || 0) / n,
        n,
        votes
    };
}

// Holds each source's condition (and day/night) for one hour/day during aggregation
export class AggregatedCondition {

    data: { [source: string]: Condition } = {};
    isDayVotes: { [source: string]: boolean } = {};

    addDataPoint(source: string, condition: Condition | undefined, isDay?: boolean) {
        if (condition != null) {
            this.data[source] = condition;
        }
        if (isDay != null) {
            this.isDayVotes[source] = isDay;
        }
    }

    get result() {
        return aggregateConditions(this.data);
    }

    // Majority of the sources that say whether it's day or night; undefined if none do
    get isDay(): boolean | undefined {
        const values = Object.values(this.isDayVotes);
        if (values.length === 0) {
            return undefined;
        }
        return values.filter(value => value).length * 2 >= values.length;
    }
}
