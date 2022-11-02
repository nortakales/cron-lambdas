import { Format, toReadablePacificDate } from "../../utilities";
import { getAggregatedData } from "./aggregate";

async function main() {

    const data = await getAggregatedData();

    console.log("Starting report");
    //console.log(JSON.stringify(data, null, 2));

    for (let dailyData of data.daily) {
        console.log(toReadablePacificDate(dailyData.datetime, Format.DATE_ONLY));
        //console.log("Max Temp: " + dailyData.temp.max.toString());
        // console.log("Min Temp: " + dailyData.temp.min.toString());
        //console.log("Wind Speed: " + dailyData.wind_speed.toString());
        //console.log("Wind Gust: " + dailyData.wind_gust.toString());
        // console.log("PoP: " + dailyData.pop.toString());
        console.log("Rain: " + dailyData.rain.toString());
        // console.log("Snow: " + dailyData.snow.toString());
        console.log('');
    }

    // for (let hourlyData of data.hourly) {
    //     console.log(toReadablePacificDate(hourlyData.datetime, Format.DATE_AND_TIME));
    //     //console.log("Temp: " + hourlyData.temp.toString());
    //     console.log("Wind Speed: " + hourlyData.wind_speed.toString());
    //     //console.log("Wind Gust: " + hourlyData.wind_gust.toString());
    //     // console.log("PoP: " + hourlyData.pop.toString());
    //     // console.log("Rain: " + hourlyData.rain.toString());
    //     //console.log("Snow: " + hourlyData.snow.toString());
    //     console.log('');
    // }
}

// main();