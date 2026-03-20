# Weather Sources Analysis

## Currently Integrated Sources

### 1. OpenWeather (One Call 3.0) — `ow`
- **Status:** Enabled
- **Endpoint:** `https://api.openweathermap.org/data/3.0/onecall`
- **Auth:** API key (AWS Secrets Manager)
- **Pricing:** One Call 3.0 requires a subscription — 1,000 calls/day free, then pay-per-call
- **Data provided:** Current conditions, minutely precipitation, hourly forecast (48h), daily forecast (8 days), weather alerts
- **Notable:** Only source providing minutely precipitation data and official weather alerts

### 2. Weather.gov / NOAA National Weather Service — `wg`
- **Status:** Enabled
- **Endpoint:** `https://api.weather.gov/gridpoints/SEW/130,76`
- **Auth:** None (custom User-Agent header)
- **Pricing:** Free, unlimited (US government service)
- **Data provided:** Hourly forecasts (temperature, apparent temp, wind chill, heat index, dew point, humidity, sky cover, wind speed/direction/gust, PoP, precipitation, snowfall). Daily data computed from hourly.
- **Notable:** Completely free, no API key needed. Gridpoint-based (hardcoded for Seattle area).

### 3. Tomorrow.io — `ti`
- **Status:** Enabled
- **Endpoint:** `https://api.tomorrow.io/v4/timelines`
- **Auth:** API key (AWS Secrets Manager)
- **Pricing:** Free tier: 500 calls/day (25/hr, 3/sec)
- **Data provided:** Current conditions, hourly forecast, 5-day daily forecast. Includes precipitation probability/intensity/type, rain/snow/ice accumulation.

### 4. VisualCrossing — `vc`
- **Status:** Enabled
- **Endpoint:** `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/forecast`
- **Auth:** API key (AWS Secrets Manager)
- **Pricing:** Free tier: 1,000 records/day
- **Data provided:** Hourly data (temp, wind, precip type, PoP, precip/snow amounts). Daily computed from hourly aggregation.

### 5. Open-Meteo — `om`
- **Status:** Enabled
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Auth:** None
- **Pricing:** Free, unlimited for non-commercial use
- **Data provided:** Hourly (temp, humidity, precipitation, rain, showers, snowfall, snow depth, wind speed/direction/gust), daily (high/low temp, precip sums, wind max). 7-day forecast range.
- **Notable:** No API key required. Open source. Uses NOAA GFS, ECMWF, and other models.

### 6. AccuWeather — `aw`
- **Status:** Enabled
- **Endpoints:** 12-hour hourly + 5-day daily forecasts
- **Auth:** 2 API keys with failover (AWS Secrets Manager)
- **Pricing:** Free tier: 50 calls/day. This is likely the $1/month paid source given the dual-key setup.
- **Data provided:** Hourly (12h: temp, feels like, visibility, precip, snow, dew point, UV, clouds, humidity, wind), daily (5-day: high/low temps, wind, PoP, precipitation).

### 7. Meteomatics — `mm`
- **Status:** DISABLED
- **Reason:** "No more free plan" (noted in code)
- **Data provided (when active):** Wind speed, wind gust, wind direction, temperature, precipitation (1-hour aggregates)
- **Auth was:** Basic auth (username:password via Secrets Manager)

---

## Potential New Sources to Integrate

### Tier 1 — Strong Candidates

#### WeatherAPI.com
- **URL:** https://www.weatherapi.com
- **Free tier:** 1,000,000 calls/month — by far the most generous free tier available
- **Paid tier:** $4/month for 2M calls and 14-day extended forecast
- **Data:** Current conditions, hourly forecast, daily forecast (3 days free / 14 days paid), weather alerts (government-issued for US/UK/Europe), air quality, astronomy
- **Wind/snow/precip/temp:** Yes to all
- **Alerts:** Yes — pass `alerts=yes` parameter
- **Limitations:** Free plan forecast limited to 3 days
- **Reputation:** Very popular, well-documented. One of the most commonly recommended free weather APIs.
- **Why integrate:** Massive free tier, includes alerts, provides all needed data points. Very low barrier to entry.

#### Pirate Weather
- **URL:** https://pirateweather.net
- **Free tier:** 10,000–20,000 calls/month ($2/month donation bumps to 20K)
- **Data:** Current conditions, minutely precipitation (60 min), hourly forecast (48h, extendable to 168h), 7-day daily forecast, severe weather alerts, precipitation type breakdown (rain/snow/ice), snow accumulation estimates
- **Wind/snow/precip/temp:** Yes — detailed snow accumulation using density model adjusted for temp and wind speed
- **Alerts:** Yes — government severe weather alerts
- **Limitations:** Community/donation-funded. Based on NOAA GFS/HRRR models. Dark Sky API-compatible format.
- **Reputation:** Well-regarded in the Home Assistant community as a Dark Sky replacement. Open source. NOAA HRRR model is particularly good for US locations.
- **Why integrate:** Excellent snow/precip detail, US-focused HRRR model works well for Seattle, Dark Sky-compatible API format, effectively free.

### Tier 2 — Moderate Candidates

#### Weatherbit
- **URL:** https://www.weatherbit.io
- **Free tier:** 500 calls/day (~15,000/month), non-commercial use only
- **Paid tier:** $35/month for 50K calls (significant jump)
- **Data:** Current conditions, 7-day daily forecast, air quality, solar radiation
- **Wind/snow/precip/temp:** Yes
- **Alerts:** Paid plans only
- **Limitations:** Free tier is non-commercial only. Hourly forecasts may require paid plan. No alerts on free tier.
- **Why consider:** Decent free tier with good data quality. Worth it if you want another daily forecast data point.
- **Why hesitate:** No alerts on free, hourly may be paid-only, non-commercial restriction.

#### Meteosource
- **URL:** https://www.meteosource.com
- **Free tier:** 400 calls/day, 10 calls/minute rate limit
- **Data:** Current conditions, minutely precipitation, hourly forecasts, daily forecasts (up to 30 days on paid), weather alerts
- **Wind/snow/precip/temp:** Yes
- **Alerts:** Yes
- **Limitations:** Free plan limited to 1-day forecast range. Standard variables only on free plan.
- **Why consider:** Has alerts and minutely data on free tier.
- **Why hesitate:** 1-day forecast limit on free plan is very restrictive for a 7-day alert system.

#### Google Weather API
- **URL:** https://developers.google.com/maps/documentation/weather
- **Free tier:** Likely included in Google Maps Platform $200/month free credit
- **Data:** Current conditions, forecasts (details not fully documented yet)
- **Limitations:** Relatively new API. Pricing and full capabilities not well documented.
- **Why consider:** Google-backed reliability, likely generous free tier via Maps Platform credit.
- **Why hesitate:** New and less documented, unclear feature set, requires Google Cloud billing setup.

### Tier 3 — Niche / Limited Candidates

#### Xweather (formerly AerisWeather)
- **URL:** https://www.xweather.com
- **Free tier:** Only via Contributor Plan — requires contributing data from a personal weather station via PWSWeather. Gives 1,000 calls/day.
- **Data:** Hyper-local weather, forecasts, severe weather + lightning alerts
- **Alerts:** Yes — including lightning
- **Why consider:** Enterprise-grade quality, excellent alerts including lightning.
- **Why hesitate:** Only free if you have a PWS contributing data. Otherwise enterprise pricing.

#### Storm Glass
- **URL:** https://stormglass.io
- **Free tier:** 10 requests/day, all parameters included
- **Data:** Full weather data, originally marine/coastal focused
- **Limitations:** 10 calls/day is very restrictive. Marine/coastal focus. No alerts.
- **Why pass:** Too few free calls for a monitoring system.

#### Weatherstack
- **URL:** https://weatherstack.com
- **Free tier:** ~100 calls/month, HTTP only (no HTTPS)
- **Limitations:** No HTTPS on free tier. Possibly no forecasts on free plan. No alerts. Extremely low call limit.
- **Why pass:** Too many limitations on free plan.

### Not Viable (Trial Only / Enterprise Pricing)

| Service | Reason |
|---------|--------|
| **Foreca** | 30-day trial only, annual enterprise licensing |
| **Ambee** | 15-day trial only, custom enterprise pricing |
| **Meteomatics** | Already tried — dropped free plan |

---

## Summary Comparison

| Source | Status | Free Calls | Forecast Range | Alerts | Snow | Cost |
|--------|--------|-----------|----------------|--------|------|------|
| **OpenWeather** | ✅ Active | 1K/day | 8 days | Yes | Yes | Free tier |
| **Weather.gov** | ✅ Active | Unlimited | ~7 days | No | Yes | Free |
| **Tomorrow.io** | ✅ Active | 500/day | 5 days | No | Yes | Free tier |
| **VisualCrossing** | ✅ Active | 1K records/day | ~7 days | No | Yes | Free tier |
| **Open-Meteo** | ✅ Active | Unlimited | 7 days | No | Yes | Free |
| **AccuWeather** | ✅ Active | 50/day | 5 days | No | Yes | Free/Paid |
| **Meteomatics** | ❌ Disabled | N/A | N/A | N/A | N/A | No free plan |
| | | | | | | |
| **WeatherAPI.com** | 🆕 Candidate | **1M/month** | 3 days (free) | **Yes** | Yes | Free |
| **Pirate Weather** | 🆕 Candidate | 10-20K/month | 7 days | **Yes** | **Yes (detailed)** | Free / $2 |
| **Weatherbit** | 🆕 Maybe | 500/day | 7 days | Paid only | Yes | Free |
| **Meteosource** | 🆕 Maybe | 400/day | 1 day (free) | Yes | Yes | Free |
| **Google Weather** | 🆕 Unknown | TBD | TBD | TBD | TBD | Likely free |

## Recommendations

1. **WeatherAPI.com** — Integrate first. The 1M calls/month free tier is absurdly generous and it includes weather alerts. Provides all the data your system needs.

2. **Pirate Weather** — Integrate second. Uses NOAA HRRR model which is excellent for US locations. Detailed snow accumulation modeling. Dark Sky-compatible API format makes it straightforward to implement. Essentially free.

3. **Weatherbit** — Consider if you want another data point in your aggregation. Good free tier (500/day) but no alerts on free plan.

4. **Google Weather API** — Keep an eye on this as it matures. Google-backed reliability could make it a strong addition once documentation and pricing are clearer.
