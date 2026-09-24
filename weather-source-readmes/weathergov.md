[Website](https://www.weather.gov/documentation/services-web-api) · [Gridpoints FAQ](https://weather-gov.github.io/api/gridpoints) ·
See also [docs/weather-alert-system.md](../docs/weather-alert-system.md)

User agent should be similar to `User-Agent: (myweatherapp.com, contact@myweatherapp.com)`

## Alerts (not yet integrated)

Official NWS alerts for the exact location (preferred):

https://api.weather.gov/alerts/active?point=47.807,-122.1924

Or for the forecast zone (`WAZ313`) or the whole state:

https://api.weather.gov/alerts/active/zone/WAZ313
https://api.weather.gov/alerts/active?area=WA

## Grid lookup

Resolve lat/lon to office/grid (and forecast zone, county, etc.):

https://api.weather.gov/points/{latitude},{longitude}

Coordinates are limited to 4 decimal places. More precision gets a 301 redirect to the rounded URL:

https://api.weather.gov/points/47.807,-122.1924

As of 2026-09-24 this returns **`SEW` / `131,77`** (forecast zone `WAZ313`), which is what the code uses
(it used `130,76` before). NWS says grid mappings can change, so re-check `/points` periodically.

## Forecast endpoints

7-day day/night text forecast:

https://api.weather.gov/gridpoints/SEW/131,77/forecast

7-day hourly text forecast:

https://api.weather.gov/gridpoints/SEW/131,77/forecast/hourly

```
{
    "number": 1,
    "name": "",
    "startTime": "2021-11-10T16:00:00-08:00",
    "endTime": "2021-11-10T17:00:00-08:00",
    "isDaytime": true,
    "temperature": 49,
    "temperatureUnit": "F",
    "temperatureTrend": null,
    "windSpeed": "7 mph",
    "windDirection": "E",
    "icon": "https://api.weather.gov/icons/land/day/rain,60?size=small",
    "shortForecast": "Light Rain Likely",
    "detailedForecast": ""
},
```

Those endpoints don't include much quantitative data (rain amounts, for example). The raw gridpoint data does,
and it's what the lambda uses:

https://api.weather.gov/gridpoints/SEW/131,77

Notes on the raw gridpoint format (see `src/lambda/weather/data-sources/weathergov/`):

- Each property is a list of `{validTime: "<ISO start>/<ISO 8601 duration>", value}`. Periods vary from 1 to 12+
  hours, and the code expands them to hourly.
- Units: temperatures are `wmoUnit:degC`, wind is `wmoUnit:km_h-1`, direction is `wmoUnit:degree_(angle)`,
  precip/snow/ice are `wmoUnit:mm`, PoP/RH/sky are `wmoUnit:percent`. Any other unit throws, which drops the source.
- `quantitativePrecipitation`, `snowfallAmount` and `iceAccumulation` are **totals for the whole period**
  (usually 6 h), so the code divides them evenly across the hours.
- The whole forecast covers about 8 days (`validTimes` like `2026-09-24T00:00:00+00:00/P8DT1H`).
