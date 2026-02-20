import toast from "react-hot-toast";
import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";
import { set, get, clear } from "idb-keyval";
import { isDeleted, clearDeletedParks } from "./deletedParks";

const TILE_STEP = 0.5;
const TILE_LOOKAHEAD = 0;
const MOVEMENT_LOOKAHEAD = 0;

const TOAST_ID = "park-loader";

let parkData: Park[] = [];
let processedTiles: Map<string, boolean> = new Map();

// Ensures updateParkData waits for the initial IndexedDB load to finish
// before firing any tile fetches.
let initPromise: Promise<void> | null = null;

// Serializes all merge operations so they run one at a time,
// preventing concurrent workers from racing to overwrite parkData.
let mergeQueue: Promise<void> = Promise.resolve();

async function saveMergedParksToDB() {
  await set("merged_parks", parkData);
}

export async function loadMergedParks() {
  initPromise = (async () => {
    const cached = await get("merged_parks");
    if (cached && cached.length > 0) {
      parkData = cached;
      console.log("Loaded merged parks from IndexedDB:", parkData.length);
    }
  })();
  await initPromise;
}

export function getParkData() {
  return parkData;
}

export function getBoundedParkData(north: number, east: number, south: number, west: number) {
  return parkData.filter((park) => {
    if (!park.boundingBox) return false;
    if (isDeleted(park.id)) return false;

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
    await set("merged_parks", []);
    await clearDeletedParks();
    parkData = [];
    processedTiles.clear();
    toast.success("Cache cleared", { id: TOAST_ID });
  } catch (err) {
    console.error("Failed to clear IndexedDB:", err);
    toast.error("Failed to clear cache", { id: TOAST_ID });
  }
}

function mergeParksInWorker(newParks: Park[]): Promise<Park[]> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./mergeWorker.ts", import.meta.url), { type: "module" });

    // Deduplicate by ID — parkData may already contain parks from a previously
    // processed tile (e.g. loaded from cache), so filter out any newParks whose
    // ID is already present before merging.
    const existingIds = new Set(parkData.map((p) => p.id));
    const uniqueNewParks = newParks.filter((p) => !existingIds.has(p.id));

    if (uniqueNewParks.length === 0) {
      resolve(parkData);
      return;
    }

    worker.postMessage([...parkData, ...uniqueNewParks]);

    worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        toast.loading(`Merging parks... ${event.data.progress}%`, { id: TOAST_ID });
        return;
      }
      if (event.data.type === "result") {
        resolve(event.data.data);
        worker.terminate();
      }
    };
  });
}

function addParkData(data: any): Promise<void> {
  // Chain onto the existing queue so merges always run sequentially.
  // Each task captures parkData at the moment it actually starts (not when enqueued),
  // so it always sees the result of the previous merge.
  mergeQueue = mergeQueue.then(async () => {
    const newParks = convertToParkList(data);
    parkData = await mergeParksInWorker(newParks);
    await saveMergedParksToDB();
  });
  return mergeQueue;
}

export async function updateTile(lat: number, lon: number, key: string) {
  try {
    const cached = await get(`tile_${key}`);

    if (cached) {
      toast.loading("Loading from cache...", { id: TOAST_ID });
      await addParkData(cached);
      return;
    }

    toast.loading("Fetching parks...", { id: TOAST_ID });
    const data = await fetchMapData(lat, lon, lat + TILE_STEP, lon + TILE_STEP);
    await set(`tile_${key}`, data);
    await addParkData(data);
  } catch (e) {
    console.error(`Failed to process tile ${key}:`, e);
    processedTiles.set(key, false);
  }
}

export async function updateParkData(bbox: [number, number, number, number]) {
  // Wait for the initial IndexedDB load before doing anything
  if (initPromise) await initPromise;

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
    // Kick off all fetches concurrently (network is still parallel),
    // but merges are serialized via mergeQueue so parkData stays consistent.
    await Promise.all(tasks);
    toast.success(`${parkData.length} parks loaded`, { id: TOAST_ID });
  }
}