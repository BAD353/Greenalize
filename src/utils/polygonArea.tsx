export default function polygonArea(coords: [number, number][]): [number, number, number] {
    if (coords.length < 3) return [0, 0, 0];

    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad / Math.PI) * 180;

    const cartesian = coords.map(([lat, lon]) => {
        const x = R * toRad(lon) * Math.cos(toRad(lat));
        const y = R * toRad(lat);
        return [x, y] as [number, number];
    });

    let area = 0;
    let centrX = 0;
    let centrY = 0;

    for (let i = 0; i < cartesian.length; i++) {
        const [x0, y0] = cartesian[i];
        const [x1, y1] = cartesian[(i + 1) % cartesian.length];
        let cross = x0 * y1 - x1 * y0;
        area += cross;
        centrX += (x0 + x1) * cross;
        centrY += (y0 + y1) * cross;
    }

    area *= 0.5;
    centrX /= 6 * area;
    centrY /= 6 * area;

    const centrLatRad = centrY / R;
    const centrLonRad = centrX / (R * Math.cos(centrLatRad));
    const centrLat = toDeg(centrLatRad);
    const centrLon = toDeg(centrLonRad);

    return [Math.abs(area), centrLat, centrLon];
}
