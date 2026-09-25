// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    aggregateConditions, AggregatedCondition, Condition, fromAccuWeatherIcon, fromGoogleType, fromOpenWeatherId,
    fromPirateWeatherIcon, fromTomorrowIoCode, fromVisualCrossingConditions, fromWmoCode
} from './conditions';

const votes = (...conditions: Condition[]) => Object.fromEntries(conditions.map((condition, i) => [`s${i}`, condition]));

test('two-step vote: user example, 5 clear and 1 rain is clear', () => {
    assert.equal(aggregateConditions(votes('clear', 'clear', 'clear', 'clear', 'clear', 'rain'))!.value, 'clear');
});

test('two-step vote: cloudy variants are not outvoted by a clear plurality', () => {
    const result = aggregateConditions(votes(
        'clear', 'clear', 'clear', 'clear',
        'partly_cloudy', 'partly_cloudy', 'partly_cloudy',
        'mostly_cloudy', 'mostly_cloudy', 'mostly_cloudy',
        'cloudy', 'cloudy', 'cloudy'))!;
    assert.equal(result.value, 'partly_cloudy'); // median of the scale, not the "clear" plurality
    assert.equal(result.n, 13);
    assert.equal(result.agreement, 3 / 13);
    // 9 of 13 cloudy-ish with most of them heavily clouded
    assert.equal(aggregateConditions(votes('clear', 'clear', 'clear', 'clear', 'mostly_cloudy', 'mostly_cloudy',
        'cloudy', 'cloudy', 'cloudy', 'cloudy', 'cloudy'))!.value, 'mostly_cloudy');
});

test('two-step vote: precipitation needs a strict majority', () => {
    // half rain (counted as cloudy) and half clear -> between them
    assert.equal(aggregateConditions(votes('rain', 'rain', 'rain', 'clear', 'clear', 'clear'))!.value, 'partly_cloudy');
    assert.equal(aggregateConditions(votes('rain', 'rain', 'rain', 'rain', 'clear', 'clear', 'clear'))!.value, 'rain');
});

test('two-step vote: minority precipitation votes count as cloudy for the sky median', () => {
    // clear, clear, clear, cloudy(rain), cloudy(rain) -> median clear; with 3 rain of 7 -> cloudy side
    // (sorted: clear, clear, partly_cloudy, cloudy, cloudy, cloudy, cloudy -> cloudy)
    assert.equal(aggregateConditions(votes('clear', 'clear', 'clear', 'light_rain', 'light_rain'))!.value, 'clear');
    assert.equal(aggregateConditions(votes('clear', 'clear', 'partly_cloudy', 'light_rain', 'rain', 'drizzle', 'cloudy'))!.value, 'cloudy');
});

test('two-step vote: rain intensity is the median of the rain votes', () => {
    assert.equal(aggregateConditions(votes('light_rain', 'heavy_rain', 'rain', 'clear'))!.value, 'rain');
    assert.equal(aggregateConditions(votes('light_rain', 'heavy_rain', 'clear'))!.value, 'rain'); // averaged, even count
    assert.equal(aggregateConditions(votes('drizzle', 'light_rain', 'clear'))!.value, 'light_rain'); // rounds up
    assert.equal(aggregateConditions(votes('drizzle', 'drizzle', 'heavy_rain'))!.value, 'drizzle');
});

test('two-step vote: precipitation type by plurality, ties by severity', () => {
    assert.equal(aggregateConditions(votes('snow', 'snow', 'rain', 'clear'))!.value, 'snow');
    assert.equal(aggregateConditions(votes('snow', 'rain', 'thunderstorm'))!.value, 'thunderstorm');
    assert.equal(aggregateConditions(votes('sleet', 'snow', 'cloudy'))!.value, 'sleet');
    // all rain intensities count together as "rain" for the type vote
    assert.equal(aggregateConditions(votes('light_rain', 'rain', 'snow', 'snow', 'heavy_rain'))!.value, 'rain');
});

test('two-step vote: fog', () => {
    assert.equal(aggregateConditions(votes('fog', 'fog', 'clear', 'cloudy'))!.value, 'fog');
    assert.equal(aggregateConditions(votes('fog', 'clear', 'clear', 'cloudy'))!.value, 'clear');
    assert.equal(aggregateConditions(votes('fog'))!.value, 'fog');
});

test('two-step vote: no votes', () => {
    assert.equal(aggregateConditions({}), undefined);
});

test('AggregatedCondition collects conditions and day/night votes', () => {
    const aggregated = new AggregatedCondition();
    aggregated.addDataPoint('a', 'clear', true);
    aggregated.addDataPoint('b', undefined, true); // unmapped condition, still votes on day/night
    aggregated.addDataPoint('c', 'mostly_clear', false);
    assert.deepEqual(aggregated.data, { a: 'clear', c: 'mostly_clear' });
    assert.equal(aggregated.isDay, true);
    assert.equal(aggregated.result!.n, 2);
    assert.equal(new AggregatedCondition().isDay, undefined);
});

test('WMO codes', () => {
    assert.equal(fromWmoCode(0), 'clear');
    assert.equal(fromWmoCode(2), 'partly_cloudy');
    assert.equal(fromWmoCode(3), 'cloudy');
    assert.equal(fromWmoCode(48), 'fog');
    assert.equal(fromWmoCode(53), 'drizzle');
    assert.equal(fromWmoCode(66), 'sleet');
    assert.equal(fromWmoCode(80), 'light_rain');
    assert.equal(fromWmoCode(65), 'heavy_rain');
    assert.equal(fromWmoCode(86), 'snow');
    assert.equal(fromWmoCode(99), 'thunderstorm');
    assert.equal(fromWmoCode(null), undefined);
});

test('OpenWeather ids', () => {
    assert.equal(fromOpenWeatherId(211), 'thunderstorm');
    assert.equal(fromOpenWeatherId(310), 'drizzle');
    assert.equal(fromOpenWeatherId(500), 'light_rain');
    assert.equal(fromOpenWeatherId(502), 'heavy_rain');
    assert.equal(fromOpenWeatherId(511), 'sleet');
    assert.equal(fromOpenWeatherId(601), 'snow');
    assert.equal(fromOpenWeatherId(616), 'sleet');
    assert.equal(fromOpenWeatherId(741), 'fog');
    assert.equal(fromOpenWeatherId(721), undefined); // haze
    assert.equal(fromOpenWeatherId(801), 'mostly_clear');
    assert.equal(fromOpenWeatherId(803), 'mostly_cloudy');
    assert.equal(fromOpenWeatherId(804), 'cloudy');
});

test('Tomorrow.io codes, 4 and 5 digit', () => {
    assert.equal(fromTomorrowIoCode(1000), 'clear');
    assert.equal(fromTomorrowIoCode(1102), 'mostly_cloudy');
    assert.equal(fromTomorrowIoCode(2100), 'fog');
    assert.equal(fromTomorrowIoCode(4200), 'light_rain');
    assert.equal(fromTomorrowIoCode(8000), 'thunderstorm');
    assert.equal(fromTomorrowIoCode(0), undefined);
    // 5-digit day/night codes
    assert.equal(fromTomorrowIoCode(10000), 'clear');
    assert.equal(fromTomorrowIoCode(10011), 'cloudy');
    assert.equal(fromTomorrowIoCode(11030), 'partly_cloudy');
    assert.equal(fromTomorrowIoCode(21060), 'fog');
    assert.equal(fromTomorrowIoCode(42040), 'drizzle'); // partly cloudy and drizzle
    assert.equal(fromTomorrowIoCode(42000), 'light_rain');
    assert.equal(fromTomorrowIoCode(42140), 'light_rain'); // partly cloudy and light rain
    assert.equal(fromTomorrowIoCode(42080), 'rain'); // partly cloudy and rain
    assert.equal(fromTomorrowIoCode(40010), 'rain');
    assert.equal(fromTomorrowIoCode(42020), 'heavy_rain'); // partly cloudy and heavy rain
    assert.equal(fromTomorrowIoCode(51150), 'snow');
    assert.equal(fromTomorrowIoCode(51080), 'sleet'); // rain and snow
    assert.equal(fromTomorrowIoCode(62040), 'sleet');
    assert.equal(fromTomorrowIoCode(71100), 'sleet');
    assert.equal(fromTomorrowIoCode(80030), 'thunderstorm');
});

test('Tomorrow.io: every documented daytime code maps to something', () => {
    // All weatherCodeDay values from https://docs.tomorrow.io/reference/data-layers-weather-codes
    const dayCodes = [10000, 11000, 11010, 11020, 10010, 11030, 21000, 21010, 21020, 21030, 21060, 21070, 21080, 20000,
        42040, 42030, 42050, 40000, 42000, 42130, 42140, 42150, 42090, 42080, 42100, 40010, 42110, 42020, 42120, 42010,
        51150, 51160, 51170, 50010, 51000, 51020, 51030, 51040, 51220, 51050, 51060, 51070, 50000, 51010, 51190, 51200,
        51210, 51100, 51080, 51140, 51120, 60000, 60030, 60020, 60040, 62040, 62060, 62050, 62030, 62090, 62000, 62130,
        62140, 62150, 60010, 62120, 62200, 62220, 62070, 62020, 62080, 62010, 71100, 71110, 71120, 71020, 71080, 71070,
        71090, 70000, 71050, 71060, 71150, 71170, 71030, 71130, 71140, 71160, 71010, 80010, 80030, 80020, 80000];
    for (const code of dayCodes) {
        assert.notEqual(fromTomorrowIoCode(code), undefined, `code ${code}`);
    }
});

test('AccuWeather icons', () => {
    assert.equal(fromAccuWeatherIcon(1), 'clear');
    assert.equal(fromAccuWeatherIcon(3), 'partly_cloudy');
    assert.equal(fromAccuWeatherIcon(38), 'mostly_cloudy');
    assert.equal(fromAccuWeatherIcon(8), 'cloudy');
    assert.equal(fromAccuWeatherIcon(12), 'rain');
    assert.equal(fromAccuWeatherIcon(16), 'thunderstorm');
    assert.equal(fromAccuWeatherIcon(22), 'snow');
    assert.equal(fromAccuWeatherIcon(29), 'sleet');
    assert.equal(fromAccuWeatherIcon(31), undefined); // cold
});

test('Google types', () => {
    assert.equal(fromGoogleType('MOSTLY_CLEAR'), 'mostly_clear');
    assert.equal(fromGoogleType('LIGHT_RAIN'), 'light_rain');
    assert.equal(fromGoogleType('RAIN_SHOWERS'), 'rain');
    assert.equal(fromGoogleType('HEAVY_RAIN'), 'heavy_rain');
    assert.equal(fromGoogleType('SNOWSTORM'), 'snow');
    assert.equal(fromGoogleType('RAIN_AND_SNOW'), 'sleet');
    assert.equal(fromGoogleType('SCATTERED_THUNDERSTORMS'), 'thunderstorm');
    assert.equal(fromGoogleType('WINDY'), undefined);
});

test('Pirate Weather icons', () => {
    assert.equal(fromPirateWeatherIcon('clear-night'), 'clear');
    assert.equal(fromPirateWeatherIcon('mostly-clear-day'), 'mostly_clear');
    assert.equal(fromPirateWeatherIcon('mostly-cloudy-night'), 'mostly_cloudy');
    assert.equal(fromPirateWeatherIcon('cloudy'), 'cloudy');
    assert.equal(fromPirateWeatherIcon('drizzle'), 'drizzle');
    assert.equal(fromPirateWeatherIcon('light-rain'), 'light_rain');
    assert.equal(fromPirateWeatherIcon('possible-rain-day'), 'light_rain');
    assert.equal(fromPirateWeatherIcon('possible-snow-night'), 'snow');
    assert.equal(fromPirateWeatherIcon('rain'), 'rain');
    assert.equal(fromPirateWeatherIcon('sleet'), 'sleet');
    assert.equal(fromPirateWeatherIcon('thunderstorm'), 'thunderstorm');
    assert.equal(fromPirateWeatherIcon('wind'), undefined);
});

test('Visual Crossing conditions text', () => {
    assert.equal(fromVisualCrossingConditions('Clear'), 'clear');
    assert.equal(fromVisualCrossingConditions('Partially cloudy'), 'partly_cloudy');
    assert.equal(fromVisualCrossingConditions('Overcast'), 'cloudy');
    assert.equal(fromVisualCrossingConditions('Rain, Overcast'), 'rain');
    assert.equal(fromVisualCrossingConditions('Light Rain, Partially cloudy'), 'light_rain');
    assert.equal(fromVisualCrossingConditions('Snow, Rain, Overcast'), 'sleet');
    assert.equal(fromVisualCrossingConditions('Freezing Drizzle/Freezing Rain'), 'sleet');
    assert.equal(fromVisualCrossingConditions('Thunderstorm, Rain'), 'thunderstorm');
    assert.equal(fromVisualCrossingConditions('Fog'), 'fog');
    assert.equal(fromVisualCrossingConditions(''), undefined);
});
