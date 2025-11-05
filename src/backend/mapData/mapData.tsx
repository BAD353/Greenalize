import toast from "react-hot-toast";
import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";
import { set, get, clear } from "idb-keyval";

const TILE_STEP = 0.5;
const TILE_LOOKAHEAD = 0;
const MOVEMENT_LOOKAHEAD = 0;

let parkData: Park[] = [];
let processedTiles: Map<string, boolean> = new Map();
let processedParks: Map<number, boolean> = new Map();

async function saveMergedParksToDB() {
    await set("merged_parks", parkData);
}

export async function loadMergedParks() {
    const cached = await get("merged_parks");
    if (cached) {
        parkData = cached;
        console.log("Loaded merged parks from IndexedDB:", parkData.length);
    }
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

export async function forceReload() {
    try {
        await clear();
        parkData = [];
        processedParks.clear();
        processedTiles.clear();
        toast.success("Cleared!");
    } catch (err) {
        console.error("Failed to clear IndexedDB:", err);
    }
}

async function mergeParksInWorker(newParks: Park[], toastId: any) {
    return new Promise<Park[]>((resolve) => {
        const worker = new Worker(new URL("./mergeWorker.ts", import.meta.url), { type: "module" });
        worker.postMessage([...parkData, ...newParks]);
        worker.onmessage = (event) => {
            if (event.data.type === "progress") {
                console.log(event.data.text);
                return;
            }

            if (event.data.type === "result") {
                console.log("Merging complete:", event.data.data);
                toast.success("Parks merged!!!", { id: toastId });
                resolve(event.data.data);
                worker.terminate();
            }
        };
    });
}

export async function addParkData(data: any) {
    const newParks = convertToParkList(data);
    const toastId = toast.loading("Merging parks...");

    parkData = await mergeParksInWorker(newParks, toastId);
    console.log("DONE");
    await saveMergedParksToDB();
    toast.success("Parks merged & saved!", { id: toastId });
    console.log("Merged parks count:", parkData.length);
}

export async function updateTile(lat: number, lon: number, key: string) {
    console.log(`REQUESTING ${lat} ${lon}`);
    try {
        const cached = await get(`tile_${key}`);
        if (cached) {
            console.log(`Loaded ${key} from IndexedDB`);
            addParkData(cached);
            return;
        }

        const data = await fetchMapData(lat, lon, lat + TILE_STEP, lon + TILE_STEP);
        await set(`tile_${key}`, data);
        console.log(`Saved ${key} to IndexedDB`);
        addParkData(data);
    } catch (e) {
        console.error(`Failed to process tile ${key}:`, e);
        processedTiles.set(key, false);
    }
}

export async function updateParkData(bbox: [number, number, number, number]) {
    const id_bbox: [number, number, number, number] = [
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

    if (tasks.length > 0) {
        const toastId = toast.loading("Loading parks...");
        await Promise.all(tasks);
        toast.success("Parks loaded!", { id: toastId });
    }
}
