
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
    var tzo = -date.getTimezoneOffset(),
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

export function toReadablePacificDate(time: number) {
    // If the time is less than a date 466 years from now, it is most likely in seconds
    // Modify it to be in millis
    if (time < 16343349350) {
        time = time * 1000;
    }
    return new Date(time).toLocaleString('en-us', { timeZone: 'America/Los_Angeles' })
}