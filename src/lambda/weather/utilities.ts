import moment from 'moment-timezone';

export enum Format {
    DATE_ONLY,
    TIME_ONLY,
    DATE_AND_TIME,
    ISO_8601
}

export function toReadablePacificDate(time: number, format?: Format) {
    // If the time is less than a date 466 years from now, it is most likely in seconds
    // Modify it to be in millis
    if (time < 16343349350) {
        time = time * 1000;
    }

    switch (format as Format) {
        case Format.DATE_ONLY:
            return moment(time).tz("America/Los_Angeles").format('M/D/YYYY');
        case Format.TIME_ONLY:
            return moment(time).tz("America/Los_Angeles").format('h:mm A');
        case Format.ISO_8601:
            return moment(time).tz("America/Los_Angeles").format('YYYY-MM-DDTHH:mm:ssZ');
        case Format.DATE_AND_TIME:
        case undefined:
        default:
            return moment(time).tz("America/Los_Angeles").format('M/D/YYYY, h:mm A');
    }
}

export function getStartOfDay(datetime: number) {

    // If the time is less than a date 466 years from now, it is most likely in seconds
    // Modify it to be in millis
    if (datetime < 16343349350) {
        datetime = datetime * 1000;
    }

    return moment(datetime).tz("America/Los_Angeles").startOf('day').valueOf();
}

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

export function round(number: number, decimal: number) {
    if (decimal === 0) {
        return Math.round(number);
    }
    if (decimal < 0 || decimal > 5) {
        throw new Error("Incorrect rounding decimal: " + decimal);
    }
    const modifier = Math.pow(10, decimal);
    return Math.round((number + Number.EPSILON) * modifier) / modifier;
}

export function equals(map1: { [key: string]: string }, map2: { [key: string]: string }) {

    const map1Keys = Object.keys(map1);
    const map2Keys = Object.keys(map2);

    if (map1Keys.length !== map2Keys.length) {
        return false;
    }

    for (var key of map1Keys) {
        if (map1[key] !== map2[key]) {
            return false;
        }
    }
    return true;
}