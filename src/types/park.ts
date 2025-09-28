export interface Park {
    id: number;
    name?: string;
    type?: string;
    coordinates: [number, number][];
    center: [number, number];
    boundingBox: [number, number, number, number]; // [north, east, south, west]
    area: number;
}
