
export function getDirectionFromDegrees(degrees: number) {
    if (degrees < 0 || degrees > 360)
        return "Invalid direction";
    if (degrees >= 337.5 && degrees < 22.5)
        return "South";
    if (degrees >= 22.5 && degrees < 67.5)
        return "Southwest";
    if (degrees >= 67.5 && degrees < 112.5)
        return "West";
    if (degrees >= 112.5 && degrees < 157.5)
        return "Northwest";
    if (degrees >= 157.5 && degrees < 202.5)
        return "North";
    if (degrees >= 202.5 && degrees < 247.5)
        return "Northeast";
    if (degrees >= 247.5 && degrees < 292.5)
        return "East";
    if (degrees >= 292.5 && degrees < 337.5)
        return "Southeast";
    return "Invalid direction";
}

export function toIsoString(date: Date) {
    var tzo = -date.getTimezoneOffset(), // TODO This relies on local time.. need to modify it to use specific timezone!
        dif = tzo >= 0 ? '+' : '-',
        pad = function (num: number) {
            var norm = Math.floor(Math.abs(num));
            return (norm < 10 ? '0' : '') + norm;
        };

    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        dif + pad(tzo / 60) +
        ':' + pad(tzo % 60);
}

export enum Format {
    DATE_ONLY,
    TIME_ONLY,
    DATE_AND_TIME
}

export function toReadablePacificDate(time: number, format?: Format) {
    // If the time is less than a date 466 years from now, it is most likely in seconds
    // Modify it to be in millis
    if (time < 16343349350) {
        time = time * 1000;
    }

    switch (format as Format) {
        case Format.DATE_ONLY:
            return new Date(time).toLocaleDateString('en-us', { timeZone: 'America/Los_Angeles' }) + ` <${time}>`;
        case Format.TIME_ONLY:
            return new Date(time).toLocaleTimeString('en-us', { timeZone: 'America/Los_Angeles' }) + ` <${time}>`;
        case Format.DATE_AND_TIME:
        case undefined:
        default:
            return new Date(time).toLocaleString('en-us', { timeZone: 'America/Los_Angeles' }) + ` <${time}>`;
    }
}

console.log(toReadablePacificDate(1638298800, Format.DATE_ONLY));
console.log(toReadablePacificDate(1638298800, Format.TIME_ONLY));
console.log(toReadablePacificDate(1638298800, Format.DATE_AND_TIME));
console.log(toReadablePacificDate(1638298800));


export interface AngleAndSpeed {
    angle?: number,
    speed?: number
}
const deg2rad = Math.PI / 180;
const rad2deg = 180 / Math.PI;
export function averageAngle(anglesAndSpeeds: AngleAndSpeed[]) {
    return averageAngleV4(anglesAndSpeeds);
}

function basicAverage(angles: number[]) {
    let averageAngle = 0;
    for (let angle of angles) {
        averageAngle += angle;
    }

    return averageAngle / angles.length;
}

function averageAngleV1(angles: number[]) {

    let sinSum = 0;
    let cosSum = 0;
    for (let angle of angles) {
        const radian = deg2rad * angle;
        sinSum += Math.sin(radian);
        cosSum += Math.cos(radian);
    }
    const averageAngle = Math.abs(Math.round(rad2deg * Math.atan(sinSum / cosSum)))

    return averageAngle;
}

function averageAngleV2(anglesAndSpeeds: AngleAndSpeed[]) {

    let totalEastWestVector = 0;
    let totalNorthSouthVector = 0;

    for (let point of anglesAndSpeeds) {
        if (point.speed && point.angle) {
            totalEastWestVector += point.speed * Math.sin(deg2rad * point.angle);
            totalNorthSouthVector += point.speed * Math.cos(deg2rad * point.angle);
        }
    }

    const average = Math.atan2(totalNorthSouthVector, totalEastWestVector) * rad2deg;
    //const average = Math.atan(totalEastWestVector / totalNorthSouthVector)
    const corrected = (360 * average) % 360

    console.log(JSON.stringify(anglesAndSpeeds));
    console.log(average);
    console.log(corrected);

    return corrected;

    // V_east[i] = mean(WS[i] * sin(WD[i] * pi/180))
    // V_north[i] = mean(WS[i] * cos(WD[i] * pi/180))

    // mean_WD = arctan2(V_east, V_north)) * 180/pi
    // mean_WD = (360 + mean_WD) % 360
}

function averageAngleV3(anglesAndSpeeds: AngleAndSpeed[]) {

    let sinSum = 0;
    let cosSum = 0;
    for (let point of anglesAndSpeeds) {
        if (point.angle && point.speed) {
            const radian = deg2rad * point.angle;
            sinSum += Math.sin(radian) * point.speed;
            cosSum += Math.cos(radian) * point.speed;
        }
    }
    const averageAngle = Math.abs(Math.round(rad2deg * Math.atan(sinSum / cosSum)))

    return averageAngle;
}

// https://www.scadacore.com/2014/12/19/average-wind-direction-and-wind-speed/
// This seems to be the most accurate so far, and is essentially what V3 and V2 were supposed to do
function averageAngleV4(anglesAndSpeeds: AngleAndSpeed[]) {
    let total = 0;
    let ewVector = 0;
    let nsVector = 0;
    for (let point of anglesAndSpeeds) {
        if (point.angle && point.speed) {
            const radian = deg2rad * point.angle;
            total++;
            ewVector += Math.sin(radian) * point.speed;
            nsVector += Math.cos(radian) * point.speed;
        }
    }
    const ewAverage = (ewVector / total) * -1;
    const nsAverage = (nsVector / total) * -1;

    let direction = Math.atan2(ewAverage, nsAverage) * rad2deg;
    if (direction > 180) {
        direction -= 180;
    } else if (direction < 180) {
        direction += 180;
    }
    return direction;
}

export function removeTimeFromEpochMillisForTimezone(datetime: number) {

    // If the time is less than a date 466 years from now, it is most likely in seconds
    // Modify it to be in millis
    if (datetime < 16343349350) {
        datetime = datetime * 1000;
    }

    const dateObject = new Date(datetime);
    const localIsoString = toIsoString(dateObject);
    //console.log(localIsoString);
    const droppedTimeLocalIsoString = localIsoString.replace(/T\d{2}:\d{2}:\d{2}/, 'T00:00:00');
    //console.log(droppedTimeLocalIsoString);
    const newDateObject = new Date(droppedTimeLocalIsoString);
    //console.log(newDateObject.getTime());
    return newDateObject.getTime();
}

//removeTimeFromEpochMillisForTimezone(1637394001123);