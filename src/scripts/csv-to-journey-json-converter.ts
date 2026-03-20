import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as moment from 'moment-timezone';


/**

Prompt used:

# Objective

I want to write a script in typescript that will take a csv file and convert it into a series of json files (one json file per row of the csv file). The data represents journal entries. An example CSV file is currently in context: "Notes Stream - Moving to Journey.csv"

# CSV structure

The CSV has these columns:

Date - YYYY/MM/DD format, Pacific timezone
Time - HH:MM [A|P]M format, Pacific timezone
Tags - comma separated tags
Notes - the actual journal entry content
Weather - Degrees Fahrenheit followed by weather conditions
Latitude - latitude coordinate
Longitude - longitude coordinate
Location - name of the location

# JSON Structure

Here is an example JSON file:

```json
{
  "date_modified": 1770098158000,
  "date_journal": 1770098158000,
  "timezone": "America/Los_Angeles",
  "text": "<p>Test entry<br><br>Test line</p>",
  "lat": 47.80706484744281,
  "lon": -122.19273639179582,
  "address": "Test Location",
  "weather": {
    "id": -1,
    "degree_c": 2.5,
    "icon": "11n"
  },
  "tags": [
    "house"
  ],
  "type": "html"
}
```

date_modified - this can be the current millis since epoch
date_journal - this should be millis since epoch and should be converted from the Date and Time CSV fields (remember those are Pacific timezone)
timezone - hardcode to "America/Los_Angeles"
text - This should be exactly what is in the Notes CSV column, surrounded by HTML paragraph tags like "<p>ACTUAL CONTENT HERE</p>"
lat - the Latitude column
lon - the Longitude column
address - the Location column
weather id - hardcoded to -1
weather degree_c - convert the degrees Fahrenheit from the Weather column to Celsius
weather icon - convert the weather condition from the Weather column to a matching identifier from the "Weather Icons" table below. You will need to select an icon based both on weather condition and whether it is night or day (from the Time column)
tags - an array of tags from the Tags column
type - hardcode to HTML

Note: some CSV rows are missing latitude and longitude. If that happens, leave those fields out of the JSON file.

# Weather Icons

01n - clear night
02n - partly cloudy night
03n - mostly cloudy night
04n - cloudy night

01d - clear day
02d - partly cloudy day
03d - mostly cloudy day
04d - cloudy day

10d - rainy day
11d - thunderstorm day

10n - rainy night
11n - thunderstorm night

 */



interface JournalEntry {
  date_modified: number;
  date_journal: number;
  timezone: string;
  text: string;
  lat?: number;
  lon?: number;
  address: string;
  weather: {
    id: number;
    degree_c: number;
    icon: string;
  };
  tags: string[];
  type: string;
}

const PACIFIC_TZ = 'America/Los_Angeles';
const ALLOWED_TAGS = [
  'event',
  'house',
  'ella',
  'tattoo',
  'health',
  'sports',
  'work',
  'family',
  'vacation',
  'holiday',
  'yard',
  'mini',
  'autox',
  'pets',
  'movie',
  'weather',
  'woodworking',
];

// Generate a random 6-character alphanumeric string
function generateRandomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Convert Fahrenheit to Celsius
function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

// Parse weather string like "71.6°F Partly Cloudy" 
function parseWeather(weatherStr: string): {
  tempF: number;
  condition: string;
} {
  const match = weatherStr.match(/^([\d.]+)°F\s+(.+)$/);
  if (!match) {
    throw new Error(`Invalid weather format: ${weatherStr}`);
  }
  return {
    tempF: parseFloat(match[1]),
    condition: match[2].trim(),
  };
}

// Determine if it's day or night based on time string
function isDay(timeStr: string): boolean {
  if (!timeStr) return true; // Default to day
  const hour = parseInt(timeStr.split(':')[0]);
  const isPm = timeStr.includes('PM');

  const hour24 = isPm && hour !== 12 ? hour + 12 : hour;

  // Day is roughly 6 AM to 6 PM (6-18)
  return hour24 >= 6 && hour24 < 18;
}

// Map weather condition to icon
function getWeatherIcon(condition: string, isDayTime: boolean): string {
  const timeSuffix = isDayTime ? 'd' : 'n';
  const conditionLower = condition.toLowerCase();

  // Clear conditions
  if (conditionLower.includes('clear') && !conditionLower.includes('mostly')) {
    return `01${timeSuffix}`;
  }

  // Sunny
  if (conditionLower.includes('sunny')) {
    return '01d';
  }

  // Mostly clear / Mostly sunny
  if (conditionLower.includes('mostly') && (conditionLower.includes('clear') || conditionLower.includes('sunny'))) {
    return `02${timeSuffix}`;
  }

  // Partly cloudy
  if (conditionLower.includes('partly')) {
    return `02${timeSuffix}`;
  }

  // Mostly cloudy
  if (conditionLower.includes('mostly') && conditionLower.includes('cloudy')) {
    return `03${timeSuffix}`;
  }

  // Thunderstorm
  if (conditionLower.includes('thunderstorm') || conditionLower.includes('thunder')) {
    return `11${timeSuffix}`;
  }

  // Rain
  if (conditionLower.includes('rain') || conditionLower.includes('drizzle') || conditionLower.includes('snow')) {
    return `10${timeSuffix}`;
  }

  // Smoky (treat as mostly cloudy)
  if (conditionLower.includes('smoky')) {
    return `03${timeSuffix}`;
  }

  // Cloudy
  if (conditionLower.includes('cloudy')) {
    return `04${timeSuffix}`;
  }

  // Windy (treat as cloudy)
  if (conditionLower.includes('windy')) {
    return `04${timeSuffix}`;
  }

  // If no match found, throw an error
  throw new Error(`Unknown weather condition: "${condition}"`);
}

// Parse date and time strings to get epoch milliseconds in Pacific timezone
function getDateJournalEpoch(dateStr: string, timeStr: string): number {
  // dateStr format: YYYY/MM/DD
  // timeStr format: H:MM [AP]M
  const dateTimeParts = `${dateStr} ${timeStr}`;

  // Parse using moment-timezone
  const m = moment.tz(dateTimeParts, 'YYYY/MM/DD h:mm A', PACIFIC_TZ);

  if (!m.isValid()) {
    throw new Error(`Invalid date/time: ${dateTimeParts}`);
  }

  return m.valueOf();
}

// Parse tags string (comma-separated) into array
function parseTags(tagsStr: string): string[] {
  if (!tagsStr || !tagsStr.trim()) {
    return [];
  }

  const tags = tagsStr
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0);

  // Validate all tags against allowed list
  for (const tag of tags) {
    if (!ALLOWED_TAGS.includes(tag)) {
      throw new Error(`Unknown tag: "${tag}". Allowed tags are: ${ALLOWED_TAGS.join(', ')}`);
    }
  }

  return tags;
}

// Convert CSV row to JSON entry
function csvRowToJsonEntry(row: Record<string, string>): JournalEntry {
  const { Date: dateStr, Time: timeStr, Tags, Notes, Weather, Latitude, Longitude, Location } = row;

  // Parse weather
  const { tempF, condition } = parseWeather(Weather);
  const isDayTime = isDay(timeStr);
  const tempC = fahrenheitToCelsius(tempF);

  // Parse date/time
  const dateJournal = getDateJournalEpoch(dateStr, timeStr);

  // Current time for date_modified
  const dateModified = Date.now();

  // Parse coordinates
  const lat = Latitude ? parseFloat(Latitude) : undefined;
  const lon = Longitude ? parseFloat(Longitude) : undefined;

  // Parse tags and always add hardcoded "imported" tag
  const tags = [...parseTags(Tags), 'imported'];

  // Calculate rounded temperature
  let roundedTempC = Math.round(tempC * 10) / 10;
  // Journey has a bug with 0 celsius, so we use 0.1 instead
  if (roundedTempC === 0) {
    roundedTempC = 0.1;
  }

  // Create JSON object
  const entry: JournalEntry = {
    date_modified: dateModified,
    date_journal: dateJournal,
    timezone: PACIFIC_TZ,
    text: `<p>${Notes}</p>`,
    address: Location,
    weather: {
      id: -1,
      degree_c: roundedTempC,
      icon: getWeatherIcon(condition, isDayTime),
    },
    tags,
    type: 'html',
  };

  // Add lat/lon only if they exist
  if (lat !== undefined && !isNaN(lat)) {
    entry.lat = lat;
  }
  if (lon !== undefined && !isNaN(lon)) {
    entry.lon = lon;
  }

  return entry;
}

// Main function
async function convertCsvToJson(): Promise<void> {
  const inputDir = path.join(process.cwd(), 'csv-input');
  const outputDir = path.join(process.cwd(), 'json-output');

  // Ensure input directory exists
  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Find CSV files in input directory
  const csvFiles = fs
    .readdirSync(inputDir)
    .filter(file => file.endsWith('.csv'));

  if (csvFiles.length === 0) {
    console.error(`No CSV files found in ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${csvFiles.length} CSV file(s)`);

  for (const csvFile of csvFiles) {
    const csvPath = path.join(inputDir, csvFile);
    console.log(`\nProcessing: ${csvFile}`);

    // Read CSV file
    const fileContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Found ${records.length} entries`);

    let successCount = 0;
    let errorCount = 0;

    // Process each row
    for (let i = 0; i < records.length; i++) {
      try {
        const entry = csvRowToJsonEntry(records[i] as Record<string, string>);

        // Create filename from date and time with random identifier
        const { Date: dateStr, Time: timeStr } = records[i] as Record<string, string>;
        const dateClean = dateStr.replace(/\//g, '-');
        const timeClean = timeStr.replace(/:/g, '-').replace(' ', '_');
        const randomId = generateRandomId();
        const filename = `${dateClean}_${timeClean}_${randomId}.json`;

        const outputPath = path.join(outputDir, filename);

        // Write JSON file
        fs.writeFileSync(
          outputPath,
          JSON.stringify(entry, null, 2),
          'utf-8'
        );

        successCount++;
      } catch (error) {
        console.error(
          `Error processing row ${i + 1}:`,
          error instanceof Error ? error.message : error
        );
        errorCount++;
      }
    }

    console.log(`\nConversion complete:`);
    console.log(`  ✓ Successful: ${successCount}`);
    if (errorCount > 0) {
      console.log(`  ✗ Errors: ${errorCount}`);
    }
    console.log(`  Output location: ${outputDir}`);
  }
}

// Run the converter
convertCsvToJson().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
