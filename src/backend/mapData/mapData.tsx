import toast from "react-hot-toast";
import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";
import { set, get } from "idb-keyval";
import { isDeleted, clearDeletedParks } from "./deletedParks";

const TILE_STEP = 0.5;
const TILE_LOOKAHEAD = 0;
const MOVEMENT_LOOKAHEAD = 0;

const PROGRESS_TOAST_ID = "park-loader-progress";
const ERROR_TOAST_ID    = "park-loader-error";

const MAX_RETRIES     = 3;
const BASE_RETRY_MS   = 1000;

let parkData: Park[] = [];
let processedTiles: Map<string, boolean> = new Map();
let initPromise: Promise<void> | null = null;
let mergeQueue: Promise<void> = Promise.resolve();

// --- Tile progress tracking ---
// Each tile reports its own progress (0–100). We combine them into one toast.
const tileProgress: Map<string, number> = new Map();

function updateProgressToast() {
  if (tileProgress.size === 0) return;
  const values = Array.from(tileProgress.values());
  const overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  toast.loading(`Loading parks... ${overall}%`, { id: PROGRESS_TOAST_ID });
}

function setTileProgress(key: string, pct: number) {
  tileProgress.set(key, pct);
  updateProgressToast();
}

function finishTileProgress(key: string) {
  tileProgress.delete(key);
  if (tileProgress.size === 0) {
    toast.success(`${parkData.length} parks loaded`, { id: PROGRESS_TOAST_ID });
  } else {
    updateProgressToast();
  }
}

// --- IndexedDB helpers ---
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

export function getAvailableTags(): string[] {
  const tagSet = new Set<string>();
  for (const park of parkData) {
    for (const tag of park.tags ?? []) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

export function getBoundedParkData(
  north: number,
  east: number,
  south: number,
  west: number,
  activeTags: string[] = []
) {
  return parkData.filter((park) => {
    if (!park.boundingBox) return false;
    if (isDeleted(park.id)) return false;

    const [pNorth, pEast, pSouth, pWest] = park.boundingBox;
    const inBounds = !(
      pSouth > north + MOVEMENT_LOOKAHEAD ||
      pNorth < south - MOVEMENT_LOOKAHEAD ||
      pWest > east + MOVEMENT_LOOKAHEAD ||
      pEast < west - MOVEMENT_LOOKAHEAD
    );
    if (!inBounds) return false;

    if (activeTags.length === 0) return true;
    return park.tags?.some((t) => activeTags.includes(t)) ?? false;
  });
}

export async function forceReload() {
  try {
    await set("merged_parks", []);
    await clearDeletedParks();
    parkData = [];
    processedTiles.clear();
    toast.success("Cache cleared", { id: PROGRESS_TOAST_ID });
  } catch (err) {
    console.error("Failed to clear IndexedDB:", err);
    toast.error("Failed to clear cache", { id: ERROR_TOAST_ID });
  }
}

// --- Merge worker ---
function mergeParksInWorker(newParks: Park[], tileKey: string): Promise<Park[]> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./mergeWorker.ts", import.meta.url), { type: "module" });

    const existingIds = new Set(parkData.map((p) => p.id));
    const uniqueNewParks = newParks.filter((p) => !existingIds.has(p.id));

    if (uniqueNewParks.length === 0) {
      resolve(parkData);
      return;
    }

    worker.postMessage([...parkData, ...uniqueNewParks]);

    worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        // Merge worker progress counts as the second half of this tile's progress (50–100)
        const mergePercent = 50 + Math.round(event.data.progress / 2);
        setTileProgress(tileKey, mergePercent);
        return;
      }
      if (event.data.type === "result") {
        resolve(event.data.data);
        worker.terminate();
      }
    };
  });
}

function addParkData(data: any, tileKey: string): Promise<void> {
  mergeQueue = mergeQueue.then(async () => {
    const newParks = convertToParkList(data);
    parkData = await mergeParksInWorker(newParks, tileKey);
    await saveMergedParksToDB();
  });
  return mergeQueue;
}

// --- Fetch with retry ---
async function fetchWithRetry(
  lat: number,
  lon: number,
  tileKey: string,
  attempt = 0
): Promise<any> {
  try {
    const data = await fetchMapData(lat, lon, lat + TILE_STEP, lon + TILE_STEP);
    return data;
  } catch (err: any) {
    const is429 = err?.status === 429 || err?.response?.status === 429;
    const isNetworkError = !err?.status;

    if (attempt >= MAX_RETRIES) {
      throw err;
    }

    let delayMs: number;
    if (is429) {
      const retryAfter = err?.response?.headers?.get?.("Retry-After");
      delayMs = retryAfter ? parseInt(retryAfter, 10) * 10000 : 10000;
      toast.error(
        `Rate limited — retrying tile in ${Math.round(delayMs / 1000)}s… (${attempt + 1}/${MAX_RETRIES})`,
        { id: `${ERROR_TOAST_ID}-${tileKey}`, duration: delayMs }
      );
    } else if (isNetworkError || err?.status >= 500) {
      delayMs = BASE_RETRY_MS * Math.pow(2, attempt);
      toast.error(
        `Network error — retrying… (${attempt + 1}/${MAX_RETRIES})`,
        { id: `${ERROR_TOAST_ID}-${tileKey}`, duration: delayMs }
      );
    } else {
      throw err;
    }

    await new Promise((res) => setTimeout(res, delayMs));
    return fetchWithRetry(lat, lon, tileKey, attempt + 1);
  }
}

// --- Tile loading ---
export async function updateTile(lat: number, lon: number, key: string) {
  setTileProgress(key, 0);
  try {
    const cached = await get(`tile_${key}`);

    let data: any;
    if (cached) {
      setTileProgress(key, 50); // Cache hit — skip straight to merge
      data = cached;
    } else {
      setTileProgress(key, 10);
      data = await fetchWithRetry(lat, lon, key);
      setTileProgress(key, 50);
      await set(`tile_${key}`, data);
    }

    await addParkData(data, key);
    finishTileProgress(key);
  } catch (err: any) {
    finishTileProgress(key);
    processedTiles.set(key, false); // Mark as failed so it will be retried next viewport update

    const status = err?.status ?? err?.response?.status;
    const message =
      status === 429 ? `Rate limited — try again shortly (tile ${key})`
      : status >= 500 ? `Server error ${status} loading tile ${key}`
      : status         ? `Failed to load tile ${key} (${status})`
      :                  `Network error loading tile ${key}`;

    console.error(`Failed to process tile ${key}:`, err);
    toast.error(message, { id: `${ERROR_TOAST_ID}-${key}`, duration: 6000 });
  }
}

export async function updateParkData(bbox: [number, number, number, number]) {
  if (initPromise) await initPromise;

  const id_bbox: [number, number, number, number] = [
    Math.ceil(bbox[0]  / TILE_STEP) + TILE_LOOKAHEAD,
    Math.ceil(bbox[1]  / TILE_STEP) + TILE_LOOKAHEAD,
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
}