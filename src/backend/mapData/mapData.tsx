import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";

import { set, get } from "idb-keyval";

const TILE_STEP = 0.5;
const TILE_LOOKAHEAD = 0;
const MOVEMENT_LOOKAHEAD = 0;
let parkData: Park[] = [];
let processedTiles: Map<string, boolean> = new Map();
let processedParks: Map<number, boolean> = new Map();

export function addParkData(data: any): void {
    let newParks = convertToParkList(data);
    newParks.forEach((park) => {
        if (!processedParks.get(park.id)) {
            parkData.push(park);
            processedParks.set(park.id, true);
        }
    });
    console.log("Parks Loaded: ", parkData.length);
}

export function getParkData() {
    return parkData;
}

export function getBoundedParkData(north: number, east: number, south: number, west: number) {
    return parkData.filter((park) => {
        if (!park.boundingBox) return false;
        const [pNorth, pEast, pSouth, pWest] = park.boundingBox;
        return !(
            pSouth > north + MOVEMENT_LOOKAHEAD ||
            pNorth < south - MOVEMENT_LOOKAHEAD ||
            pWest > east + MOVEMENT_LOOKAHEAD ||
            pEast < west - MOVEMENT_LOOKAHEAD
        );
    });
}

export async function updateTile(lat: number, lon: number, key: string) {
    console.log(`REQUESTING ${lat} ${lon}`);

    try {
        // Try to load from IndexedDB
        const cached = await get(`tile_${key}`);
        if (cached) {
            console.log(`Loaded ${key} from IndexedDB`);
            addParkData(cached);
            return;
        }

        // Otherwise fetch new data
        const data = await fetchMapData(lat, lon, lat + TILE_STEP, lon + TILE_STEP);

        // Save to IndexedDB (no 5MB limit)
        await set(`tile_${key}`, data);

        console.log(`Saved ${key} to IndexedDB`);
        addParkData(data);

    } catch (e) {
        console.error(`Failed to process tile ${key}:`, e);
        processedTiles.set(key, false);
    }
}

export async function updateParkData(bbox: [number, number, number, number]) {
    let id_bbox: [number, number, number, number] = [
        Math.ceil(bbox[0] / TILE_STEP) + TILE_LOOKAHEAD,
        Math.ceil(bbox[1] / TILE_STEP) + TILE_LOOKAHEAD,
        Math.floor(bbox[2] / TILE_STEP) - TILE_LOOKAHEAD,
        Math.floor(bbox[3] / TILE_STEP) - TILE_LOOKAHEAD,
    ];
    const tasks: Promise<void>[] = [];
    for (let latID = id_bbox[2]; latID <= id_bbox[0]; latID++) {
        for (let lonID = id_bbox[3]; lonID <= id_bbox[1]; lonID++) {
            const key = `${latID},${lonID}`;
            if (!processedTiles.get(key)) {
                processedTiles.set(key, true);
                tasks.push(updateTile(latID * TILE_STEP, lonID * TILE_STEP, key));
            }
        }
    }
    await Promise.all(tasks);
}
