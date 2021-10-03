
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