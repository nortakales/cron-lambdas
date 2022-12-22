export interface AccuWeatherData {
  dailyData: DailyAccuWeatherDataSummary,
  hourlyData: HourlyAccuWeatherData[]
}

export interface HourlyAccuWeatherData {
  DateTime: string, // ISO string
  EpochDateTime: number,

  Temperature: AccuWeatherDatapoint,
  RealFeelTemperature: AccuWeatherDatapoint,
  Visibility: AccuWeatherDatapoint,
  Wind: AccuWeatherWind,
  WindGust: AccuWeatherWindGust,
  RelativeHumidity: number,
  DewPoint: AccuWeatherDatapoint,
  UVIndex: number,
  CloudCover: number,
  PrecipitationProbability: number,
  RainProbability: number,
  SnowProbability: number,
  IceProbability: number,
  Rain: AccuWeatherDatapoint,
  Snow: AccuWeatherDatapoint,
  Ice: AccuWeatherDatapoint,
}

export interface DailyAccuWeatherDataSummary {
  DailyForecasts: DailyAccuWeatherData[]
}

export interface DailyAccuWeatherData {
  Date: string, // ISO string - seems to be 7 hours in even during -8
  EpochDate: number,
  Temperature: AccuWeatherDailyTemperature,
  Day: AccuWeatherHalfDayData,
  Night: AccuWeatherHalfDayData

}

export interface AccuWeatherHalfDayData {
  PrecipitationProbability: number,
  RainProbability: number,
  SnowProbability: number,
  IceProbability: number,
  Wind: AccuWeatherWind,
  WindGust: AccuWeatherWindGust,
  Rain: AccuWeatherDatapoint,
  Snow: AccuWeatherDatapoint,
  Ice: AccuWeatherDatapoint,
}

export interface AccuWeatherDatapoint {
  Value: number,
  Unit: string
}

export interface AccuWeatherWind {
  Speed: AccuWeatherDatapoint,
  Direction: AccuWeatherWindDirection
}


export interface AccuWeatherWindDirection {
  Degrees: number
}

export interface AccuWeatherWindGust {
  Speed: AccuWeatherDatapoint,
}

export interface AccuWeatherDailyTemperature {
  Minimum: AccuWeatherDatapoint,
  Maximum: AccuWeatherDatapoint
}



/*

hourly

[
  {
    "DateTime": "2022-12-21T18:00:00-08:00",
    "EpochDateTime": 1671674400,
    "WeatherIcon": 38,
    "IconPhrase": "Mostly cloudy",
    "HasPrecipitation": false,
    "IsDaylight": false,
    "Temperature": {
      "Value": 24,
      "Unit": "F",
      "UnitType": 18
    },
    "RealFeelTemperature": {
      "Value": 17,
      "Unit": "F",
      "UnitType": 18,
      "Phrase": "Very Cold"
    },
    "RealFeelTemperatureShade": {
      "Value": 17,
      "Unit": "F",
      "UnitType": 18,
      "Phrase": "Very Cold"
    },
    "WetBulbTemperature": {
      "Value": 21,
      "Unit": "F",
      "UnitType": 18
    },
    "DewPoint": {
      "Value": 14,
      "Unit": "F",
      "UnitType": 18
    },
    "Wind": {
      "Speed": {
        "Value": 8.1,
        "Unit": "mi/h",
        "UnitType": 9
      },
      "Direction": {
        "Degrees": 355,
        "Localized": "N",
        "English": "N"
      }
    },
    "WindGust": {
      "Speed": {
        "Value": 12.7,
        "Unit": "mi/h",
        "UnitType": 9
      }
    },
    "RelativeHumidity": 66,
    "IndoorRelativeHumidity": 27,
    "Visibility": {
      "Value": 10,
      "Unit": "mi",
      "UnitType": 2
    },
    "Ceiling": {
      "Value": 28700,
      "Unit": "ft",
      "UnitType": 0
    },
    "UVIndex": 0,
    "UVIndexText": "Low",
    "PrecipitationProbability": 2,
    "ThunderstormProbability": 0,
    "RainProbability": 0,
    "SnowProbability": 2,
    "IceProbability": 0,
    "TotalLiquid": {
      "Value": 0,
      "Unit": "in",
      "UnitType": 1
    },
    "Rain": {
      "Value": 0,
      "Unit": "in",
      "UnitType": 1
    },
    "Snow": {
      "Value": 0,
      "Unit": "in",
      "UnitType": 1
    },
    "Ice": {
      "Value": 0,
      "Unit": "in",
      "UnitType": 1
    },
    "CloudCover": 80,
    "Evapotranspiration": {
      "Value": 0,
      "Unit": "in",
      "UnitType": 1
    },
    "SolarIrradiance": {
      "Value": 0,
      "Unit": "W/m²",
      "UnitType": 33
    },
    "MobileLink": "http://www.accuweather.com/en/us/bothell-wa/98011/hourly-weather-forecast/336367?day=1&hbhhour=18&lang=en-us",
    "Link": "http://www.accuweather.com/en/us/bothell-wa/98011/hourly-weather-forecast/336367?day=1&hbhhour=18&lang=en-us"
  },



    daily


  {
  "Headline": {
    "EffectiveDate": "2022-12-22T19:00:00-08:00",
    "EffectiveEpochDate": 1671764400,
    "Severity": 2,
    "Text": "Snow tomorrow evening accumulating a coating to an inch, then changing to ice and continuing into Friday morning",
    "Category": "snow/ice",
    "EndDate": "2022-12-23T13:00:00-08:00",
    "EndEpochDate": 1671829200,
    "MobileLink": "http://www.accuweather.com/en/us/bothell-wa/98011/daily-weather-forecast/336367?lang=en-us",
    "Link": "http://www.accuweather.com/en/us/bothell-wa/98011/daily-weather-forecast/336367?lang=en-us"
  },
  "DailyForecasts": [
    {
      "Date": "2022-12-21T07:00:00-08:00",
      "EpochDate": 1671634800,
      "Sun": {
        "Rise": "2022-12-21T07:55:00-08:00",
        "EpochRise": 1671638100,
        "Set": "2022-12-21T16:19:00-08:00",
        "EpochSet": 1671668340
      },
      "Moon": {
        "Rise": "2022-12-21T06:07:00-08:00",
        "EpochRise": 1671631620,
        "Set": "2022-12-21T14:36:00-08:00",
        "EpochSet": 1671662160,
        "Phase": "WaningCrescent",
        "Age": 28
      },
      "Temperature": {
        "Minimum": {
          "Value": 14,
          "Unit": "F",
          "UnitType": 18
        },
        "Maximum": {
          "Value": 28,
          "Unit": "F",
          "UnitType": 18
        }
      },
      "RealFeelTemperature": {
        "Minimum": {
          "Value": 4,
          "Unit": "F",
          "UnitType": 18,
          "Phrase": "Bitterly Cold"
        },
        "Maximum": {
          "Value": 21,
          "Unit": "F",
          "UnitType": 18,
          "Phrase": "Very Cold"
        }
      },
      "RealFeelTemperatureShade": {
        "Minimum": {
          "Value": 4,
          "Unit": "F",
          "UnitType": 18,
          "Phrase": "Bitterly Cold"
        },
        "Maximum": {
          "Value": 19,
          "Unit": "F",
          "UnitType": 18,
          "Phrase": "Very Cold"
        }
      },
      "HoursOfSun": 4.5,
      "DegreeDaySummary": {
        "Heating": {
          "Value": 44,
          "Unit": "F",
          "UnitType": 18
        },
        "Cooling": {
          "Value": 0,
          "Unit": "F",
          "UnitType": 18
        }
      },
      "AirAndPollen": [
        {
          "Name": "AirQuality",
          "Value": 25,
          "Category": "Good",
          "CategoryValue": 1,
          "Type": "Ozone"
        },
        {
          "Name": "Grass",
          "Value": 0,
          "Category": "Low",
          "CategoryValue": 1
        },
        {
          "Name": "Mold",
          "Value": 0,
          "Category": "Low",
          "CategoryValue": 1
        },
        {
          "Name": "Ragweed",
          "Value": 0,
          "Category": "Low",
          "CategoryValue": 1
        },
        {
          "Name": "Tree",
          "Value": 0,
          "Category": "Low",
          "CategoryValue": 1
        },
        {
          "Name": "UVIndex",
          "Value": 1,
          "Category": "Low",
          "CategoryValue": 1
        }
      ],
      "Day": {
        "Icon": 31,
        "IconPhrase": "Cold",
        "HasPrecipitation": false,
        "ShortPhrase": "Very cold",
        "LongPhrase": "Some sun, then increasing clouds and very cold",
        "PrecipitationProbability": 15,
        "ThunderstormProbability": 0,
        "RainProbability": 0,
        "SnowProbability": 15,
        "IceProbability": 0,
        "Wind": {
          "Speed": {
            "Value": 9.2,
            "Unit": "mi/h",
            "UnitType": 9
          },
          "Direction": {
            "Degrees": 342,
            "Localized": "NNW",
            "English": "NNW"
          }
        },
        "WindGust": {
          "Speed": {
            "Value": 19.6,
            "Unit": "mi/h",
            "UnitType": 9
          },
          "Direction": {
            "Degrees": 350,
            "Localized": "N",
            "English": "N"
          }
        },
        "TotalLiquid": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Rain": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Snow": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Ice": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "HoursOfPrecipitation": 0,
        "HoursOfRain": 0,
        "HoursOfSnow": 0,
        "HoursOfIce": 0,
        "CloudCover": 47,
        "Evapotranspiration": {
          "Value": 0.02,
          "Unit": "in",
          "UnitType": 1
        },
        "SolarIrradiance": {
          "Value": 1791.3,
          "Unit": "W/m²",
          "UnitType": 33
        }
      },
      "Night": {
        "Icon": 31,
        "IconPhrase": "Cold",
        "HasPrecipitation": false,
        "ShortPhrase": "Some clouds; frigid",
        "LongPhrase": "Partly to mostly cloudy and frigid",
        "PrecipitationProbability": 1,
        "ThunderstormProbability": 0,
        "RainProbability": 0,
        "SnowProbability": 1,
        "IceProbability": 0,
        "Wind": {
          "Speed": {
            "Value": 8.1,
            "Unit": "mi/h",
            "UnitType": 9
          },
          "Direction": {
            "Degrees": 87,
            "Localized": "E",
            "English": "E"
          }
        },
        "WindGust": {
          "Speed": {
            "Value": 11.5,
            "Unit": "mi/h",
            "UnitType": 9
          },
          "Direction": {
            "Degrees": 359,
            "Localized": "N",
            "English": "N"
          }
        },
        "TotalLiquid": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Rain": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Snow": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "Ice": {
          "Value": 0,
          "Unit": "in",
          "UnitType": 1
        },
        "HoursOfPrecipitation": 0,
        "HoursOfRain": 0,
        "HoursOfSnow": 0,
        "HoursOfIce": 0,
        "CloudCover": 64,
        "Evapotranspiration": {
          "Value": 0.01,
          "Unit": "in",
          "UnitType": 1
        },
        "SolarIrradiance": {
          "Value": 0,
          "Unit": "W/m²",
          "UnitType": 33
        }
      },
      "Sources": [
        "AccuWeather"
      ],
      "MobileLink": "http://www.accuweather.com/en/us/bothell-wa/98011/daily-weather-forecast/336367?day=1&lang=en-us",
      "Link": "http://www.accuweather.com/en/us/bothell-wa/98011/daily-weather-forecast/336367?day=1&lang=en-us"
    },

*/