

[Website](https://www.weather.gov/documentation/services-web-api)

User agent should be similar to `User-Agent: (myweatherapp.com, contact@myweatherapp.com)`

How to get alerts:

https://api.weather.gov/alerts/active?area=WA

This will get a grid location (and other information like zone which might be useful for alerts):

https://api.weather.gov/points/{latitude},{longitude}
https://api.weather.gov/points/47.806994,-122.192443

Then plug that data into

https://api.weather.gov/gridpoints/{office}/{grid X},{grid Y}/forecast
https://api.weather.gov/gridpoints/SEW/130,76/forecast

for 7 day day/night forecast data

or

https://api.weather.gov/gridpoints/SEW/130,76/forecast/hourly

for 7 day hourly data

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

The above URLs unfortunately don't have much data (rain for starters), but this seems to:

https://api.weather.gov/gridpoints/SEW/130,76

Will certainly need to massage it into a format that makes more sense for my processing. Info about that API here: https://weather-gov.github.io/api/gridpoints
