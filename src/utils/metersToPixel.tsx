export default function metersToPixels(meters: number, zoom: number): number {
    return (meters / 40075016.686) * (256 * Math.pow(2, zoom));
}
