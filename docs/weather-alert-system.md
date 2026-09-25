# Weather Alert System

_Last reviewed: 2026-09-24_

This is the main doc for the weather alert lambda (`src/lambda/weather/`). It covers how the
system works, every weather data source it uses, possible new sources, and known issues.

- Lambda: `WeatherAlertCronLambda` (`src/lambda/weather/weather-alert-lambda.ts`)
- Infra: `src/lib/crons/weather-alert-construct.ts`, `src/lib/constructs/adhoc-weather-report-api.ts`
- Config: `src/config/config.json` → `weatherAlert`
- Location: 47.806994, -122.192443 (Bothell/Kenmore, WA; NWS office SEW; AccuWeather key `41277_PC` = ZIP 98021)

---

## How it works

1. **Schedule.** EventBridge rule `WeatherAlertSchedule`, using `config.weatherAlert.rate` (every 30 minutes, 48 runs per day).
2. **Fetch.** `getAggregatedData()` (`data-sources/aggregate/aggregate.ts`) calls each enabled source one after another.
   If a source throws, it's recorded in `skippedDataSources` and the run continues without it.
3. **Normalize.** Each source's `getAsCommonData()` converts its response to `WeatherData`
   (`data-sources/common/common-data.ts`): °F, mph, inches, % from 0–100, epoch seconds.
4. **Aggregate.** Hourly and daily rows are joined on **exact timestamp** (hourly = top of the hour, daily = local
   midnight in America/Los_Angeles). Each metric becomes an `AggregatedProperty` holding each source's value, plus
   the average, min, max and population std-dev. Wind direction uses `AggregatedAngleProperty` (circular mean
   and angular std-dev). The windows kept are **the last hour through +72 hours** (hourly)
   and **today through +8 days** (daily).
5. **Store.** On scheduled runs, every hour/day that hasn't started yet is written to DynamoDB
   `weather_forecast_history` (see [Forecast history & API](#forecast-history--api)).
6. **Alert.** Each alert's `processAggregate()` runs, gated by the last-fired timestamp in DynamoDB
   `weather_alert_tracker` (the timestamp is only written when the alert fires).
7. **Notify.** Email (SES) and/or Pushover.

### Report types

| Type | How it's triggered | Data | Notes |
|---|---|---|---|
| `REGULAR_AGGREGATE` | Scheduled run (default) | All enabled sources | This is what production runs |
| `REGULAR` | `REPORT_TYPE` env var (unused) | OpenWeather only | |
| `ADHOC` | API Gateway `?type=adhoc` | OpenWeather only | Returns text, doesn't notify |
| `ADHOC_AGGREGATE` | `?type=adhocAggregate` | All enabled sources | |
| `ADHOC_AGGREGATE_BREAKOUT` | `?type=adhocAggregateBreakout` | All enabled sources | Shows each source's value |

The ad-hoc API Gateway endpoint has **no auth**.

### Alerts

| Alert | Key | Min interval | Trigger (aggregate mode) | Works in production? |
|---|---|---|---|---|
| 7 Day Extreme Temperature | `7-day-extreme-temperature-alert-daily` | 1 day | daily max avg+σ > 85°F, or min avg−σ < 25°F | ✅ (last fired 2026-09-12) |
| National Weather Alert | `7-day-national-weather-alert-daily` | 1 day | any official alert from any source (de-duplicated). Currently only OpenWeather provides alerts | ✅ (fixed 2026-09-24; never fired before) |
| 7 Day Snow | `7-day-snow-alert-daily` | 1 day | daily snow avg+σ > 0.1 in | ✅ |
| Yearly First Freeze | `yearly-first-freeze-alert-daily` | 1 day, max 3 per season | daily min avg−σ ≤ 34°F | ✅ |
| 1 Hour Heavy Rain | `1-hour-heavy-rain-alert` | 1 hour | minutely precip rate avg > 0.2 in/hr. Consecutive minutes are grouped into periods with a peak. Currently only OpenWeather provides minutely data | ✅ (fixed 2026-09-24; never fired before) |
| 7 Day Wind | `7-day-wind-alert-daily` | 1 day | daily wind avg > 15 mph, or gust avg > 30 mph | ✅ |
| 48 Hour Wind | `48-hour-wind-alert-quadaily` | 6 hours | hourly wind avg > 15 mph, or gust avg > 30 mph (72 hours of data, despite the name) | ✅ |

---

## Weather data sources (implemented)

**Calls/day** is based on the actual 30-minute schedule (48 runs per day), not counting ad-hoc calls.
Alerts from different sources (OpenWeather, Pirate Weather, NWS) are merged when they have the same event name and
overlapping time windows. Minutely rain comes from OpenWeather and Pirate Weather.
**Used metrics** are the fields mapped into `WeatherData` that the aggregator actually reads. Pressure, humidity,
dew point, UV and clouds are mapped by some sources, but the aggregator only keeps them from whichever source
reaches a timestamp first, and no alert uses them.

| Source (code) | Status | API / version | Auth | Cost / plan | Calls per run → per day | Hourly range | Daily range | Minutely | Alerts | Metrics used | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **OpenWeather** (`ow`) | ✅ Enabled | One Call **3.0** `GET /data/3.0/onecall` | `appid` query param (Secrets Manager `openweathermap-apikey`) | "One Call by Call": 1,000 calls/day free, then €0.14 per 100 calls | 1 → 48 | 48 h, 1 h steps | 8 days (today + 7) | ✅ 60 min, precip rate | ✅ gov alerts | **Hourly:** temp, feels-like, visibility, PoP, rain 1 h, snow 1 h, wind speed/dir/gust (+pressure, humidity, dew point, UVI, clouds). **Daily:** min/max (+morn/day/eve/night), feels-like, PoP, rain, snow, wind speed/dir/gust, sun/moon | [One Call 3.0](https://openweathermap.org/api/one-call-3) |
| **Weather.gov / NWS** (`wg`) | ✅ Enabled | Raw gridpoint data `GET /gridpoints/SEW/131,77` (was 130,76 until 2026-09-24) | None. The User-Agent header identifies the app | Free | 1 → 48 | ~8 days, native periods of 1–12 h expanded to hourly | Computed from hourly (local-day min/max/max/sum) | ❌ | ❌ (free alerts endpoint exists, not used) | **Hourly:** temp, apparent temp, PoP, QPF (split across the period), snowfall (split), wind speed/dir/gust. Parsed but unused: max/min temp, wind chill, heat index, dew point, RH, sky cover, ice accumulation | [API docs](https://www.weather.gov/documentation/services-web-api), [gridpoints FAQ](https://weather-gov.github.io/api/gridpoints) |
| **Tomorrow.io** (`ti`) | ✅ Enabled | **v4 Timelines** `GET /v4/timelines`, timesteps `current,1h,1d` | `apikey` query param (`tomorrowio-apikey`) | Free: 500/day, 25/hour, 3/second | 1 → 48 | now → +5 days, 1 h | 5 days (1d steps start at 6 AM local) | ❌ | ❌ | **Hourly:** temp, apparent temp, PoP, `rainAccumulation`, `snowAccumulation`, wind speed/dir/gust (+pressure in **inHg**, humidity, dew point, UV, cloud cover). `visibility` is mapped but never requested. **Daily:** tempMax/Min, PoP, rainAccumulation (the day's total), snowAccumulation, wind | [Timelines](https://docs.tomorrow.io/reference/get-timelines), [data layers](https://docs.tomorrow.io/reference/data-layers-core) |
| **Visual Crossing** (`vc`) | ✅ Enabled | **Legacy** `weatherdata/forecast` (`aggregateHours=1`). **Retires 2026-12-31** | `key` query param (`visualcrossing-apikey`) | Free: 1,000 records/day | 1 → 48 | Legacy forecast horizon (up to 15 days), 1 h | Computed from hourly (only today + 7 used) | ❌ | Requested (`alertLevel=detail`) but ignored | **Hourly:** temp, PoP, precip, snow, wind speed/dir/gust. Returned but unused: humidity, heat index, wind chill, dew point, UV, visibility, pressure, cloud cover, precip type, alerts | [Timeline API (replacement)](https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/), [legacy docs](https://www.visualcrossing.com/resources/documentation/weather-api/weather-api-documentation/) |
| **Open-Meteo** (`om`) | ✅ Enabled | `GET /v1/forecast`, default `best_match` blend (here: HRRR for ~48 h, then GFS) | None | Free for non-commercial use (10k/day, 5k/hour, 600/min) | 1 → 48 | 8 days (192 h), 1 h | 8 days | ❌ | ❌ | **Hourly:** temp, apparent temp, RH, PoP, precipitation, snowfall, wind speed/dir/gust. **Daily:** max/min temp, max PoP, precip sum, snowfall sum, wind max, gust max, dominant dir. Note: its PoP is identical to NBM's (`nb`), so that one field counts NBM twice | [Forecast API](https://open-meteo.com/en/docs) |
| **AccuWeather** (`aw`) | ✅ Enabled | Core Weather Forecasts **v1**: `hourly/12hour` + `daily/5day` | `apikey` query param (`accuweather-api-key`). The new portal documents `Authorization: Bearer` | Free "Limited Trial" ended Sept 2025. Now a 14-day trial, then paid **Starter from $2/mo**. Calls currently succeed, so a paid key is presumably in use | 2 → 96 | 12 h, 1 h | 5 days | ❌ (MinuteCast is a separate product) | ❌ | **Hourly:** temp, RealFeel, visibility, PoP, rain, snow, wind speed/dir/gust (+humidity, dew point, UV, clouds). **Daily:** min/max, **day-only** PoP, day+night rain, day+night snow, max wind/gust, average dir | [Developer docs](https://developer.accuweather.com/documentation/overview), [auth](https://developer.accuweather.com/documentation/authentication) |
| **Open-Meteo per-model**: ECMWF IFS (`ec`), NBM (`nb`), GEM (`gm`), ICON (`ic`), UKMO (`uk`) | ✅ Enabled (added 2026-09-24) | `GET /v1/forecast?models=` `ecmwf_ifs`, `ncep_nbm_conus`, `gem_seamless`, `icon_seamless`, `ukmo_seamless` (one call each) | None | Free (same limits as `om`) | 5 → 240 | 8 days, 1 h (ICON ~7.75 days, UKMO ~7.25 days; hours past a model's range are skipped) | 8 days (ICON/UKMO 7) | ❌ | ❌ | Same fields as `om` | [Forecast API](https://open-meteo.com/en/docs), [models](https://open-meteo.com/en/docs#weather_models) |
| **Pirate Weather** (`pw`) | ✅ Enabled (added 2026-09-24) | `GET /forecast/{key}/{lat},{lon}?units=us&extend=hourly&version=2` (API V2.10) | Key in the URL **path** (`pirateweather-apikey`) | Free: 10,000 calls/month | 1 → 48 (~1,440/month) | 168 h, 1 h | 8 days | ✅ 61 min, precip rate in/hr | ✅ (title/issued/expires) | **Minutely:** precipIntensity. **Hourly:** temp, apparent temp, PoP, liquid accumulation (rain), snow accumulation, wind speed/bearing/gust (+pressure, humidity, dew point, UV, clouds, visibility). **Daily:** temperatureMax/Min (midnight to midnight), PoP, liquid/snow accumulation, bearing. Daily wind/gust = **max of hourly**, because PW's daily windSpeed/windGust are daily averages. PW is itself a blend (HRRR, NBM, ECMWF, GFS, GEFS, HRDPS, GDPS) | [API docs](https://docs.pirateweather.net/en/latest/API/) |
| **Google Weather** (`gw`) | ✅ Enabled (added 2026-09-24) | Maps Platform Weather API v1: `forecast/hours:lookup` (paged, 24 h max per page) + `forecast/days:lookup` | `key` query param (`google-weather-apikey`) | Free: 10,000 calls/month, then $0.15 per 1,000. Cap the daily quota in GCP (~300/day) so it can't bill | 4 → 192 (~5,800/month) | 72 h, 1 h | 8 days (days run 7 AM–7 AM, split into day/night halves) | ❌ | ❌ | **Hourly:** temp, feels-like, PoP, qpf (rain), snowQpf, wind speed/dir/gust (+pressure, humidity, dew point, UV, clouds, visibility). **Daily:** max/min temp; PoP = max of halves; rain/snow = sum of halves; wind/gust = max of halves; dir = weighted average | [Docs](https://developers.google.com/maps/documentation/weather), [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) |
| **NWS Alerts** (`na`) | ✅ Enabled (added 2026-09-24) | `GET api.weather.gov/alerts/active?point={lat},{lon}&status=actual` | None (User-Agent) | Free | 1 → 48 | — | — | ❌ | ✅ Official watches/warnings/advisories (start = `onset`, end = `ends`) | Alerts only | [Alerts](https://www.weather.gov/documentation/services-web-api#/default/alerts_active) |
| **Meteomatics** (`mm`) | ❌ Disabled ("no more free plan") | `GET /{start}--{end}:PT1H/{params}/{lat,lon}/json` + OAuth token from `login.meteomatics.com` | Basic auth → token (`meteomatics-api-credentials`) | No free plan anymore (14-day trial, then custom pricing) | (1 token + 1 data) | 8 days, 1 h | Computed from hourly | ❌ | ❌ | wind_speed_10m, wind_gusts_10m_1h, wind_dir_10m, t_2m, precip_1h | [Getting started](https://www.meteomatics.com/en/api/getting-started/) |

Unused config: the `accuweather-alternate-api-key` secret/env var (fetched on every call but never used since
"Use single accuweather api key").

---

## Forecast history & API

Added 2026-09-24. Code: `src/lambda/weather/history/forecast-history.ts` (storage format, writer, reader),
`src/lambda/weather/weather-data-api-lambda.ts` (API), `src/lib/constructs/weather-data-api.ts` (infra).

### Storage

DynamoDB table **`weather_forecast_history`**: partition key `series` (`"hourly"` | `"daily"`), sort key `epoch`
(seconds: the hour's start, or local midnight for daily). Pay-per-request, deletion protection, point-in-time
recovery (35 days), and a Retain policy.

- **What's stored:** the aggregator's hourly rows (72 hours) and daily rows (8 days), after unit conversion, plus the
  voted weather `condition` (see [Weather conditions](#weather-conditions)). For each
  metric: `avg`, `min`, `max`, `std`, `n` (number of sources), and `sources` (each source's value). Minutely data isn't
  stored.
  - Hourly metrics: `temp`, `feels_like`, `visibility`, `pop`, `rain`, `snow`, `wind_speed`, `wind_deg`, `wind_gust`.
  - Daily metrics: `temp_max`, `temp_min`, `pop`, `rain`, `snow`, `wind_speed`, `wind_deg`, `wind_gust`.
  - pressure/humidity/dew point/UV/clouds are left out, since they aren't really aggregated (first source wins).
- **Other attributes:** `time` (ISO, Pacific), `date` (YYYY-MM-DD), `updatedAt` (the run that wrote it), `sources`
  (short codes that contributed), `skippedSources` (sources that failed in that run).
- **When items are written:** every scheduled run replaces the whole item for each hour/day that **hasn't started
  yet**. A source skipped in a run is missing from those items until the next run.
- **When items freeze:** an hour freezes when it starts. A day freezes at its **start** (local midnight), so a day's
  history is the forecast from about 11:30 PM the night before. Freezing at the end of the day would store misleading
  values, because some sources (e.g. Pirate Weather's wind) only cover the remaining hours of today.
- **Scope:** ad-hoc runs never write. A storage failure logs an error (reaching the error notifier) but doesn't block alerts.
- **Cost:** ~78 items of ~2 KB per run → ~225k write units/month, about $0.15/month. Storage grows ~20 MB/year.

### API

REST API "Weather Data API" (API Gateway → `WeatherDataApiLambdaFunction`). Read-only, meant to be called
server-side (no CORS).

- **Auth:** send the key in the `x-api-key` header. The key is the Secrets Manager secret `weather-data-api-key`
  (`aws secretsmanager get-secret-value --secret-id weather-data-api-key --query SecretString --output text`).
- **Throttling:** 5 requests/second, bursts of 10.
- **Caching:** responses have `Cache-Control: max-age=300`, since the data changes every 30 minutes.

| Endpoint | Returns |
|---|---|
| `GET /forecast?breakout=` | `hourly` (current hour → +72 h) and `daily` (today → +7 days) |
| `GET /hourly?start=&end=&breakout=` | Hourly items. Defaults to the next 72 hours. Max range 31 days |
| `GET /daily?start=&end=&breakout=` | Daily items. Defaults to today + 7 days. Max range 366 days |
| `GET /sources` | Source short codes → names, units for every metric, and the list of condition values |

- `start`/`end` are inclusive and take epoch seconds or ISO 8601 (`2026-09-25`, `2026-09-25T09:00`; times without an
  offset are Pacific).
- `breakout=true` includes `sources` (per-source values) in each metric. It defaults to false, which returns only the
  roll-up stats.
- Errors return `{ "error": "..." }` with 400/401/404/500.

Example (`breakout=false`):

```json
{ "generatedAt": "2026-09-24T14:50:00-07:00",
  "hourly": [ { "series": "hourly", "epoch": 1790287200, "time": "2026-09-24T15:00:00-07:00", "date": "2026-09-24",
                "updatedAt": "2026-09-24T14:32:10-07:00", "sources": ["aw", "ec", "..."], "skippedSources": [],
                "metrics": { "temp": { "avg": 60.24, "min": 56.6, "max": 65, "std": 1.98, "n": 13 }, "...": {} } } ],
  "daily": [ "..." ] }
```

---

## Weather conditions

Added 2026-09-25. Code: `src/lambda/weather/conditions/conditions.ts` (mappings + vote), tests in
`conditions.test.ts` (`npm test`).

Each source's own condition (the icon it would show) is mapped to one shared list:
`clear`, `mostly_clear`, `partly_cloudy`, `mostly_cloudy`, `cloudy`, `fog`, `drizzle`, `light_rain`, `rain`,
`heavy_rain`, `thunderstorm`, `snow`, `sleet` (sleet also covers freezing rain, ice pellets, hail, and rain/snow mix).

**Only conditions a source provides are used; nothing is derived from other metrics.** NWS isn't used (it has sky
cover % and precipitation, but no condition). Codes that don't fit the list (windy, hot, cold, haze, smoke, dust) don't
vote.

| Source | Hourly | Daily (daytime where available) |
|---|---|---|
| OpenWeather | `weather[0].id` (+ icon `d`/`n` for day/night) | `weather[0].id` (whole day, no daytime version) |
| Open-Meteo ×6 | `weather_code` (WMO) + `is_day` | `weather_code` (most severe of the whole day, no daytime version) |
| Tomorrow.io | `weatherCode` | `weatherCodeDay` (the plain 1d `weatherCode` can say clear on a rainy day) |
| Visual Crossing | `conditions` text (e.g. "Rain, Overcast") | — (its daily values are computed by us) |
| AccuWeather | `WeatherIcon` + `IsDaylight` (12 h) | `Day.Icon` |
| Pirate Weather | `icon` with `icon=pirate` (expanded set; `-day`/`-night` suffix) | `icon` |
| Google | `weatherCondition.type` + `isDaytime` | `daytimeForecast.weatherCondition.type` |

"Chance of" conditions (Pirate Weather `possible-rain-*`, Google `CHANCE_OF_SHOWERS`) count as the light version of
that precipitation type, since that's the icon the source shows.

**Two-step vote** (per hour/day):
1. If a **strict majority** of sources report precipitation, the type is chosen by plurality (ties: thunderstorm >
   sleet > snow > rain; all rain intensities count as "rain"). For rain, the intensity is the median of the rain votes
   on the drizzle → heavy_rain scale.
2. Otherwise `fog` wins if it has at least as many votes as any single sky condition. If not, the result is the
   median on the clear → cloudy scale. Minority precipitation votes count as `cloudy` there.

With an even number of votes, the median averages the two middle positions and rounds toward cloudier/heavier (e.g.
3 `clear` + 3 `cloudy` → `partly_cloudy`).

**Stored and returned** as `condition` on each hourly/daily item: `value`, `agreement` (share of sources whose
condition equals `value`), `n`, `votes` (count per condition), `isDay` (hourly only, majority of sources that report
day/night; daily conditions are daytime), and `sources` (per-source condition, only with `breakout=true`). `/sources`
lists all condition values.

---

## Candidate sources (not implemented)

NWS alerts, Open-Meteo per-model, Pirate Weather and Google Weather were implemented on 2026-09-24 (see above).

| Candidate | Cost at our volume | Notes | Docs |
|---|---|---|---|
| Other Open-Meteo models | Free | Checked 2026-09-24 at this location. `jma_seamless`: no gusts or PoP. `meteofrance_seamless`: ~4.5 days. `cma_grapes_global`: ~5 days, no PoP. `knmi_seamless`/`dmi_seamless`/`metno_seamless` return exactly ECMWF's values here (regional models that fall back outside Europe). `gfs_seamless`/`ncep_hrrr_conus` duplicate `om`. `ecmwf_aifs025`, `kma_seamless`, `bom_access_global`: no data | [Models](https://open-meteo.com/en/docs#weather_models) |
| **WeatherAPI.com** | Free: 100,000 calls/month (**no longer 1M**) | 3-day forecast only on free. Starter is $7/mo (7-day forecast), over budget | [Pricing](https://www.weatherapi.com/pricing.aspx) |
| Meteomatics / Foreca / Ambee | Trial only or enterprise | Not viable | |
| Weatherbit / Meteosource / Xweather | Not re-verified in this review | See git history of `.claude/reports/weather-sources-analysis.md` for the earlier assessment | |

---|---|---|---|---|---|---|---|
| **NWS Alerts** `GET api.weather.gov/alerts/active?point=lat,lon` | Free | — | — | — | ✅ Official NWS watches/warnings/advisories | Would add a second alerts source (only OpenWeather provides alerts today): official, free, no key. Verified 200 on 2026-09-24 | [Alerts](https://www.weather.gov/documentation/services-web-api#/default/alerts_active) |
| **Open-Meteo, per-model** (`&models=ecmwf_ifs025,gfs_seamless,ncep_nbm_conus,ncep_hrrr_conus,gem_seamless,icon_seamless`) | Free, same single call | 8+ days (HRRR ~48 h) | up to 16 days | 15-min for some models | ❌ | Adds ~5 **independent NWP models** (ECMWF, GFS, NBM, Canadian GEM, German ICON) for free, which suits the averaging approach. Verified today: all returned full data except `ecmwf_aifs025` (empty hourly). Downside: one vendor, so it fails as a unit | [Forecast API](https://open-meteo.com/en/docs) |
| **Pirate Weather** | Free: 10,000 calls/month (~1,440 needed). Donation tiers raise limits | 48 h (168 h with `extend=hourly`) | 8 days | ✅ 60 min | ✅ | Dark Sky-style schema. Blends HRRR/NBM/GFS/ECMWF; strong for the US. Has precip type and snow accumulation | [API docs](https://docs.pirateweather.net/en/latest/API/), [site](https://pirateweather.net/) |
| **Google Maps Weather API** | Free: 10,000 events/month across all Weather endpoints, then $0.15 per 1,000. Needs a GCP billing account | up to 240 h (paged, ~24 h per page → ~3 calls for 72 h) | 10 days | ❌ | Check (public alerts endpoint availability varies) | Went GA June 2025. Uses WeatherNext AI blended with NWP. ~4 calls per run × 1,440 runs = ~5,800/month, within the free cap at 30-minute runs (or half that hourly) | [Docs](https://developers.google.com/maps/documentation/weather), [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) |
| **WeatherAPI.com** | Free: 100,000 calls/month (**no longer 1M**) | 3 days | **3 days only on free** | ❌ | Limited on free | Starter is $7/mo (7-day forecast), over budget. Only useful for the 48/72-hour wind window | [Pricing](https://www.weatherapi.com/pricing.aspx) |
| Meteomatics / Foreca / Ambee | Trial only or enterprise | | | | | Not viable | |
| Weatherbit / Meteosource / Xweather | Not re-verified in this review | | | | | See git history of `.claude/reports/weather-sources-analysis.md` for the earlier assessment | |

**Recommended order:** (1) NWS alerts, (2) Open-Meteo per-model, (3) Pirate Weather, (4) Google Weather.
All four are $0 at current volume.

---

## Known issues

From the 2026-09-24 review. File/line refs point to `src/lambda/weather/` unless a path is given.

### Fixed on 2026-09-24
- National Weather Alert and 1 Hour Heavy Rain Alert were stubs in aggregate mode (production), so they had never
  fired. Aggregation now passes through minutely data and de-duplicated alerts.
- The schedule used `config.autoxReminder.rate`. It now uses `config.weatherAlert.rate`, which is set to 30 minutes
  to keep the existing cadence.
- Weather.gov grid moved from `SEW/130,76` (whose polygon no longer contains the location) to `SEW/131,77`.
- `getDirectionFromDegrees`: `>= 337.5 && < 22.5` could never be true, so 337.5°–22.5° printed "Invalid direction".
  Note: the labels intentionally name the direction the wind blows **toward** (0° → "South"). That's by design.
- Cross-source wind direction used an arithmetic mean (350° + 10° → 180°). It now uses a circular mean.
  `averageAngle` also returned 180 instead of 0 for averages exactly at due north, ignored 0° values, and
  returned NaN with no data. NaN values are now ignored by `AggregatedProperty`.
- Tomorrow.io rain (hourly and daily) used `precipitationIntensity`, an instantaneous in/hr rate. It now uses
  `rainAccumulation`. A live check on 2026-09-24 showed the daily value equals the sum of hourly values
  (0.54 vs 0.55), while intensity said 0.24.
- AccuWeather daily snow (`Day.Snow + Night.Snow`) was not mapped.
- Open-Meteo now uses current variable names (`wind_speed_10m` etc.) and also requests PoP and apparent temperature.

### Open
1. **The aggregator substitutes `snow || 0`** for sources without snow data. Accepted as-is.
2. **OpenWeather snow is probably liquid-equivalent (mm of water)**, while every other source reports snow depth,
   so it may under-report by about 10×. Needs verification during a snow event.
3. **Daily-from-hourly sources (wg, vc) use partial days** for today and the last day. They also use `|| 0` / `|| 999`
   sentinels that turn 0°F into 999 and cap max temp at ≥ 0. Meteomatics also resets max to `0` instead of `-999`.
4. **Stats inflate on disagreement.** Temp/snow alerts use `avg ± σ`, so a single outlier source can trigger an alert.
5. **Skipped-source messages are dropped** unless another alert also fires.
6. **API keys leak into logs and notifications.** Request URLs with keys are logged (2-year retention). This now
   includes Pirate Weather (key in the URL path) and Google Weather (key query param). On failure,
   the URL is also in `statusMessage`, which goes to the ERROR log subscription → error notifier, **and** into the
   skipped-source text in email/push.
7. **The ad-hoc API Gateway has no auth.** Anyone with the URL can make you spend paid quota.
8. **Visual Crossing legacy endpoint retires 2026-12-31.** Migrate to the Timeline API
   (`/timeline/{lat},{lon}/next7days?unitGroup=us&include=hours,days,alerts`), about 8 records per call.
9. **AccuWeather auth.** The new portal documents only `Authorization: Bearer <key>`. The `apikey` query param
   still works today.
10. **Tomorrow.io:** `visibility` is mapped but not in the requested `fields`. Timelines still works on the free plan,
    but rejects an `endTime` more than 5 days ahead. Requesting exactly now + 5 days was rejected intermittently, so
    the request now leaves an hour of margin (fixed 2026-09-25).
11. **Stale code comments:** `aggregate.ts` `TOTAL_DAYS` ("All current sources give today + 7 days") and
    `TOTAL_HOURS`; `weathergov-data.ts` "not clear if sum" TODOs.
