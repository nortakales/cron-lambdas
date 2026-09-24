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

1. **Schedule.** EventBridge rule `WeatherAlertSchedule`. It currently uses **`config.autoxReminder.rate` (every 30 minutes)**,
   not `config.weatherAlert.rate` (1 hour). See [Known issues](#known-issues). CloudWatch confirms 48 runs per day.
2. **Fetch.** `getAggregatedData()` (`data-sources/aggregate/aggregate.ts`) calls each enabled source one after another.
   If a source throws, it's recorded in `skippedDataSources` and the run continues without it.
3. **Normalize.** Each source's `getAsCommonData()` converts its response to `WeatherData`
   (`data-sources/common/common-data.ts`): °F, mph, inches, % from 0–100, epoch seconds.
4. **Aggregate.** Hourly and daily rows are joined on **exact timestamp** (hourly = top of the hour, daily = local
   midnight in America/Los_Angeles). Each metric becomes an `AggregatedProperty` holding each source's value, plus
   the average, min, max and population std-dev. The windows kept are **the last hour through +72 hours** (hourly)
   and **today through +8 days** (daily).
5. **Alert.** Each alert's `processAggregate()` runs, gated by the last-fired timestamp in DynamoDB
   `weather_alert_tracker` (the timestamp is only written when the alert fires).
6. **Notify.** Email (SES) and/or Pushover.

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
| National Weather Alert | `7-day-national-weather-alert-daily` | 1 day | — | ❌ `processAggregate` is a stub. It has never fired. |
| 7 Day Snow | `7-day-snow-alert-daily` | 1 day | daily snow avg+σ > 0.1 in | ✅ |
| Yearly First Freeze | `yearly-first-freeze-alert-daily` | 1 day, max 3 per season | daily min avg−σ ≤ 34°F | ✅ |
| 1 Hour Heavy Rain | `1-hour-heavy-rain-alert` | 1 hour | — | ❌ `processAggregate` is a stub. It has never fired. |
| 7 Day Wind | `7-day-wind-alert-daily` | 1 day | daily wind avg > 15 mph, or gust avg > 30 mph | ✅ |
| 48 Hour Wind | `48-hour-wind-alert-quadaily` | 6 hours | hourly wind avg > 15 mph, or gust avg > 30 mph (72 hours of data, despite the name) | ✅ |

---

## Weather data sources (implemented)

**Calls/day** is based on the actual 30-minute schedule (48 runs per day), not counting ad-hoc calls.
**Used metrics** are the fields mapped into `WeatherData` that the aggregator actually reads. Pressure, humidity,
dew point, UV and clouds are mapped by some sources, but the aggregator only keeps them from whichever source
reaches a timestamp first, and no alert uses them.

| Source (code) | Status | API / version | Auth | Cost / plan | Calls per run → per day | Hourly range | Daily range | Minutely | Alerts | Metrics used | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **OpenWeather** (`ow`) | ✅ Enabled | One Call **3.0** `GET /data/3.0/onecall` | `appid` query param (Secrets Manager `openweathermap-apikey`) | "One Call by Call": 1,000 calls/day free, then €0.14 per 100 calls | 1 → 48 | 48 h, 1 h steps | 8 days (today + 7) | ✅ 60 min, precip rate | ✅ gov alerts (only used in non-aggregate mode) | **Hourly:** temp, feels-like, visibility, PoP, rain 1 h, snow 1 h, wind speed/dir/gust (+pressure, humidity, dew point, UVI, clouds). **Daily:** min/max (+morn/day/eve/night), feels-like, PoP, rain, snow, wind speed/dir/gust, sun/moon | [One Call 3.0](https://openweathermap.org/api/one-call-3) |
| **Weather.gov / NWS** (`wg`) | ✅ Enabled | Raw gridpoint data `GET /gridpoints/SEW/130,76` (**should be 131,77**, see issues) | None. The User-Agent header identifies the app | Free | 1 → 48 | ~8 days, native periods of 1–12 h expanded to hourly | Computed from hourly (local-day min/max/max/sum) | ❌ | ❌ (free alerts endpoint exists, not used) | **Hourly:** temp, apparent temp, PoP, QPF (split across the period), snowfall (split), wind speed/dir/gust. Parsed but unused: max/min temp, wind chill, heat index, dew point, RH, sky cover, ice accumulation | [API docs](https://www.weather.gov/documentation/services-web-api), [gridpoints FAQ](https://weather-gov.github.io/api/gridpoints) |
| **Tomorrow.io** (`ti`) | ✅ Enabled | **v4 Timelines** `GET /v4/timelines`, timesteps `current,1h,1d` | `apikey` query param (`tomorrowio-apikey`) | Free: 500/day, 25/hour, 3/second | 1 → 48 | now → +5 days, 1 h | 5 days (1d steps start at 6 AM local) | ❌ | ❌ | **Hourly:** temp, apparent temp, PoP, `precipitationIntensity` (in/hr, used as rain), `snowAccumulation`, wind speed/dir/gust (+pressure in **inHg**, humidity, dew point, UV, cloud cover). `visibility` is mapped but never requested. **Daily:** tempMax/Min, PoP, intensity (as rain), snowAccumulation, wind | [Timelines](https://docs.tomorrow.io/reference/get-timelines), [data layers](https://docs.tomorrow.io/reference/data-layers-core) |
| **Visual Crossing** (`vc`) | ✅ Enabled | **Legacy** `weatherdata/forecast` (`aggregateHours=1`). **Retires 2026-12-31** | `key` query param (`visualcrossing-apikey`) | Free: 1,000 records/day | 1 → 48 | Legacy forecast horizon (up to 15 days), 1 h | Computed from hourly (only today + 7 used) | ❌ | Requested (`alertLevel=detail`) but ignored | **Hourly:** temp, PoP, precip, snow, wind speed/dir/gust. Returned but unused: humidity, heat index, wind chill, dew point, UV, visibility, pressure, cloud cover, precip type, alerts | [Timeline API (replacement)](https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/), [legacy docs](https://www.visualcrossing.com/resources/documentation/weather-api/weather-api-documentation/) |
| **Open-Meteo** (`om`) | ✅ Enabled | `GET /v1/forecast`, default `best_match` model blend, legacy variable names (`windspeed_10m` etc.) | None | Free for non-commercial use (10k/day, 5k/hour, 600/min) | 1 → 48 | 7 days (168 h), 1 h | 7 days (today + 6) | ❌ | ❌ | **Hourly:** temp, RH, precipitation, snowfall, wind speed/dir/gust (rain, showers, snow depth fetched but unused). **Daily:** max/min temp, precip sum, snowfall sum, wind max, gust max, dominant dir. No PoP requested | [Forecast API](https://open-meteo.com/en/docs) |
| **AccuWeather** (`aw`) | ✅ Enabled | Core Weather Forecasts **v1**: `hourly/12hour` + `daily/5day` | `apikey` query param (`accuweather-api-key`). The new portal documents `Authorization: Bearer` | Free "Limited Trial" ended Sept 2025. Now a 14-day trial, then paid **Starter from $2/mo**. Calls currently succeed, so a paid key is presumably in use | 2 → 96 | 12 h, 1 h | 5 days | ❌ (MinuteCast is a separate product) | ❌ | **Hourly:** temp, RealFeel, visibility, PoP, rain, snow, wind speed/dir/gust (+humidity, dew point, UV, clouds). **Daily:** min/max, **day-only** PoP, day+night rain, max wind/gust, average dir. **Daily snow not mapped** | [Developer docs](https://developer.accuweather.com/documentation/overview), [auth](https://developer.accuweather.com/documentation/authentication) |
| **Meteomatics** (`mm`) | ❌ Disabled ("no more free plan") | `GET /{start}--{end}:PT1H/{params}/{lat,lon}/json` + OAuth token from `login.meteomatics.com` | Basic auth → token (`meteomatics-api-credentials`) | No free plan anymore (14-day trial, then custom pricing) | (1 token + 1 data) | 8 days, 1 h | Computed from hourly | ❌ | ❌ | wind_speed_10m, wind_gusts_10m_1h, wind_dir_10m, t_2m, precip_1h | [Getting started](https://www.meteomatics.com/en/api/getting-started/) |

Unused infra/config: the `weather_alert_history` DynamoDB table (0 items, never written) and the
`accuweather-alternate-api-key` secret/env var (fetched on every call but never used since "Use single accuweather api key").

---

## Candidate sources (not implemented)

Target: data comparable to what's already used (≥ 3 days hourly, ≥ 5–7 days daily, temp/wind/gust/precip/snow),
at **$0–2/month**, at roughly 1,440–2,900 calls per month (hourly or 30-minute runs).

| Candidate | Cost at our volume | Hourly | Daily | Minutely | Alerts | Notes | Docs |
|---|---|---|---|---|---|---|---|
| **NWS Alerts** `GET api.weather.gov/alerts/active?point=lat,lon` | Free | — | — | — | ✅ Official NWS watches/warnings/advisories | Best fix for the dead National Weather Alert: official, free, no key, works in aggregate mode. Verified 200 today | [Alerts](https://www.weather.gov/documentation/services-web-api#/default/alerts_active) |
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

Found in the 2026-09-24 review. File/line refs point to `src/lambda/weather/` unless a path is given.

### Functional bugs
1. **Two of seven alerts never run in production.** The scheduled path is `REGULAR_AGGREGATE`, and
   `Daily7DayNationalWeatherAlert.processAggregate` and `HourlyMinutelyHeavyRainAlert.processAggregate` both
   return `{hasAlert:false}`. DynamoDB has no timestamp for either key. OpenWeather's official alerts are fetched
   but never delivered, and `getAggregatedData()` doesn't return `current`/`minutely` at all.
2. **Schedule uses the wrong config key.** `weather-alert-construct.ts:95` uses `config.autoxReminder.rate`
   (30 min) instead of `config.weatherAlert.rate` (1 hour). This doubles every API call count.
3. **Weather.gov grid is stale.** `/points/47.807,-122.1924` now returns `SEW/131,77`, but the code hardcodes
   `SEW/130,76`, one 2.5 km cell off. NWS says grid mappings can change, so look up `/points` (and cache it)
   instead of hardcoding.
4. **Compass labels are wrong** (`utilities.ts` `getDirectionFromDegrees`). `degrees >= 337.5 && degrees < 22.5`
   can never be true, so winds from about 338°–22° print "Invalid direction". The labels are also rotated 180°
   (0° → "South"), which is "blowing toward", the opposite of the meteorological "from" convention used by every API.
5. **Aggregated wind direction uses an arithmetic mean** (`AggregatedProperty.average`), so 350° and 10° average
   to 180°. The circular `averageAngle()` helper exists but isn't used across sources.
6. **Tomorrow.io daily precip/snow are wrong.** Daily `rain` uses `precipitationIntensity` (a rate), and daily
   `snowAccumulation` returns the max hourly value, not the day's total, per Tomorrow.io docs. Use
   `rainAccumulationSum`/`snowAccumulationSum` (or sum the hourly values). `visibility` is used but not requested.
7. **AccuWeather daily snow isn't mapped**, and the aggregator substitutes `snow || 0`, so AccuWeather always votes
   0 in for daily snow. That drags the average down and inflates σ. Daily PoP uses only the day half, not
   `max(Day, Night)`.
8. **Daily snow `|| 0` also applies to any source that doesn't provide snow.** Sources without data should be
   skipped, not counted as zero.
9. **OpenWeather snow is probably liquid-equivalent (mm of water)**, while every other source reports snow depth,
   so OpenWeather under-reports snow by about 10×. Needs verification.
10. **OpenWeather minutely precipitation is a rate in mm/h**, but the heavy-rain alert treats it as "inches in 1 minute".
11. **Daily-from-hourly sources (wg, vc) use partial days** for today and the last day, and use `|| 0` / `|| 999`
    sentinels that turn 0°F into 999 and cap max temp at ≥ 0. Meteomatics also resets max to `0` instead of `-999`.
12. **Stats inflate on disagreement.** Temp/snow alerts use `avg ± σ`, so a single outlier source can trigger an
    alert (for example, a snow alert where only one source forecasts snow).
13. **Skipped-source messages are dropped.** `hasAlerts` is set, but they're only sent if another alert also fires
    (`hasEmailAlert`/`hasPushAlert` stay false).

### Security / cost
14. **API keys leak into logs and notifications.** Every request URL (with `appid=`/`apikey=`/`key=`) is logged
    (`http.ts` "GET-ing"), and CloudWatch keeps logs for 2 years. On failure, `statusMessage` includes the full URL.
    That goes to `console.error` → the ERROR log subscription → the error notifier, **and** into the
    skipped-source text in the email/push body. Move keys to headers where supported (AccuWeather Bearer,
    Tomorrow.io `apikey` header) and redact the URL in `http.ts`.
15. **The ad-hoc API Gateway has no auth.** Anyone with the URL can make you spend paid quota (OpenWeather,
    AccuWeather). Add an API key/usage plan or IAM auth.

### Upcoming deprecations
16. **Visual Crossing legacy endpoint retires 2026-12-31.** Migrate to
    `/VisualCrossingWebServices/rest/services/timeline/{lat},{lon}/next7days?unitGroup=us&include=hours,days,alerts&elements=...`.
    The response shape changes (`days[].hours[]`, `datetimeEpoch`), and cost is per day, so ~8 records/call → ~384/day.
17. **AccuWeather auth.** The new developer portal documents only `Authorization: Bearer <key>`. The `apikey` query
    param still works today but isn't documented anymore.
18. **Open-Meteo legacy variable names** (`relativehumidity_2m`, `windspeed_10m`, `windgusts_10m`,
    `winddirection_10m`, `windspeed_unit`) still work, but current docs use `relative_humidity_2m`, `wind_speed_10m`,
    etc. Update the names and `expectedHourlyUnits`/`expectedDailyUnits` together.
19. **Tomorrow.io:** Timelines still works on the free plan. Newer docs steer toward `/v4/weather/forecast`, but
    Timelines supports the `…Sum` daily fields needed for #6, so keep it for now.

### Stale code comments
- `aggregate.ts`: `TOTAL_DAYS = 8 // All current sources give today + 7 days` isn't true (ti/aw give 5, om gives 7).
  The comment on `TOTAL_HOURS` about "4 sources for 2 days" is outdated.
- `openmeteo-api.ts`: `// TODO need to convert units !!!` is already handled by URL params plus the unit check.
- `weathergov-data.ts`: the "not clear if sum" TODOs are resolved. QPF/snow/ice are period totals.
