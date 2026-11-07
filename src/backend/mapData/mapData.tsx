import toast from "react-hot-toast";
import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";
import { set, get, keys, delMany } from "idb-keyval";
import { isDeleted, clearDeletedParks } from "./deletedParks";
import { PRELOADED_CITIES, type PreloadedCity } from "../../utils/preloadedCities";
import { startLoadProgress, setLoadStep, setLoadSubProgress, setLoadDescription, setLoadDownload, finishLoadProgress, failLoadProgress } from "./loadProgress";
import { readJsonWithProgress } from "./readJsonWithProgress";

const TILE_STEP = 0.1;
const TILE_LOOKAHEAD = 0;
const MOVEMENT_LOOKAHEAD = 0;

const PROGRESS_TOAST_ID = "park-loader-progress";
const ERROR_TOAST_ID    = "park-loader-error";

const PROCESSED_TILES_KEY = "processed_tiles";
const REGION_KEY_PREFIX  = "region_";
const IMPORTED_CITIES_KEY = "imported_cities";

const MAX_RETRIES     = 3;
const BASE_RETRY_MS   = 1000;

let parkData: Park[] = [];
let processedTiles: Map<string, boolean> = new Map();
let initPromise: Promise<void> | null = null;
let mergeQueue: Promise<void> = Promise.resolve();
const pendingLoads: Set<Promise<void>> = new Set();
const cityImports: Map<string, Promise<void>> = new Map();
const parkDataListeners: Set<() => void> = new Set();

// Lets the map repaint as soon as new parks are merged instead of waiting for every load to finish
export function subscribeParkData(listener: () => void) {
  parkDataListeners.add(listener);
  return () => {
    parkDataListeners.delete(listener);
  };
}

function notifyParkDataChanged() {
  parkDataListeners.forEach((listener) => listener());
}

// --- IndexedDB helpers ---
async function saveMergedParksToDB() {
  await set("merged_parks", parkData);
}

async function saveProcessedTilesToDB() {
  const loaded = Array.from(processedTiles.entries()).filter(([, ok]) => ok).map(([key]) => key);
  await set(PROCESSED_TILES_KEY, loaded);
}

export async function loadMergedParks() {
  initPromise = (async () => {
    const cached = await get("merged_parks");
    if (cached && cached.length > 0) {
      parkData = cached;
      // Only trust the saved tiles if the parks they produced were saved too
      const cachedTiles: string[] = (await get(PROCESSED_TILES_KEY)) ?? [];
      cachedTiles.forEach((key) => processedTiles.set(key, true));
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

    return park.tags?.some((t) => activeTags.includes(t)) ?? false;
  });
}

export async function forceReload() {
  try {
    await set("merged_parks", []);
    await set(PROCESSED_TILES_KEY, []);
    await set(IMPORTED_CITIES_KEY, []);
    cityImports.clear();
    const regionKeys = (await keys()).filter((k) => typeof k === "string" && k.startsWith(REGION_KEY_PREFIX));
    await delMany(regionKeys);
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
function mergeParksInWorker(newParks: Park[]): Promise<Park[]> {
  return new Promise((resolve, reject) => {
    const existingIds = new Set(parkData.map((p) => p.id));
    const uniqueNewParks = newParks.filter((p) => !existingIds.has(p.id));

    if (uniqueNewParks.length === 0) {
      resolve(parkData);
      return;
    }

    const worker = new Worker(new URL("./mergeWorker.ts", import.meta.url), { type: "module" });
    worker.postMessage([...parkData, ...uniqueNewParks]);

    worker.onerror = (event) => {
      worker.terminate();
      reject(event);
    };

    worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        setLoadSubProgress(event.data.progress);
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
  // One failed merge must not block every later merge, so the queue itself never rejects
  const merge = mergeQueue.then(async () => {
    const newParks = convertToParkList(data);
    parkData = await mergeParksInWorker(newParks);
  });
  mergeQueue = merge.catch(() => {});
  return merge;
}

// --- Fetch with retry (exponential backoff) ---
function getRetryDelayMs(err: any, attempt: number): number {
  const retryAfterSec = parseInt(err?.retryAfter, 10);
  if (!isNaN(retryAfterSec)) return retryAfterSec * 1000;
  const backoff = BASE_RETRY_MS * Math.pow(2, attempt);
  return backoff + Math.random() * BASE_RETRY_MS; // jitter so retries don't sync up
}

async function fetchWithRetry(
  south: number,
  west: number,
  north: number,
  east: number,
  attempt = 0
): Promise<any> {
  try {
    return await fetchMapData(south, west, north, east, setLoadDownload);
  } catch (err: any) {
    const status = err?.status;
    const isRetryable = !status || status === 429 || status >= 500;

    if (!isRetryable || attempt >= MAX_RETRIES) {
      throw err;
    }

    setLoadDownload(null);
    const delayMs = getRetryDelayMs(err, attempt);
    const reason = status === 429 ? "Rate limited" : "Server unavailable";
    setLoadDescription(
      `${reason} — retrying in ${Math.round(delayMs / 1000)}s... (${attempt + 1}/${MAX_RETRIES})`
    );

    await new Promise((res) => setTimeout(res, delayMs));
    setLoadDescription("Fetching parks... this might take a minute");
    return fetchWithRetry(south, west, north, east, attempt + 1);
  }
}

// --- Region loading (one request for all missing tiles) ---
async function loadRegion(
  latStart: number,
  lonStart: number,
  latEnd: number,
  lonEnd: number,
  key: string,
  tileKeys: string[]
) {
  startLoadProgress();
  try {
    const cached = await get(`${REGION_KEY_PREFIX}${key}`);

    let data: any;
    if (cached) {
      data = cached;
    } else {
      data = await fetchWithRetry(latStart, lonStart, latEnd, lonEnd);
      await set(`${REGION_KEY_PREFIX}${key}`, data);
    }

    setLoadStep(1, "Processing parks...", 0);
    await addParkData(data);
    notifyParkDataChanged();

    setLoadStep(2, "Saving parks...");
    await saveMergedParksToDB();
    await saveProcessedTilesToDB();

    finishLoadProgress(`${parkData.length} parks loaded`);
  } catch (err: any) {
    failLoadProgress();
    tileKeys.forEach((k) => processedTiles.set(k, false)); // Mark as failed so it will be retried next viewport update

    const status = err?.status;
    const message =
      status === 429 ? "Rate limited — try again shortly"
      : status >= 500 ? `Server error ${status} loading parks`
      : status         ? `Failed to load parks (${status})`
      :                  "Network error loading parks";

    console.error(`Failed to process region ${key}:`, err);
    toast.error(message, { id: ERROR_TOAST_ID, duration: 6000 });
  }
}

// --- Preloaded cities ---
async function importPreloadedCity(city: PreloadedCity) {
  const imported: string[] = (await get(IMPORTED_CITIES_KEY)) ?? [];
  if (imported.includes(city.id) && parkData.length > 0) return;

  startLoadProgress();
  setLoadDescription(`Loading ${city.name}...`);
  try {
    const response = await fetch(city.file);
    if (!response.ok) throw new Error(`Failed to fetch ${city.file}`);
    const { parks }: { parks: Park[] } = await readJsonWithProgress(response, setLoadDownload);

    setLoadStep(1, "Processing parks...", 0);
    const merge = mergeQueue.then(async () => {
      parkData = parkData.length === 0 ? parks : await mergeParksInWorker(parks);
    });
    mergeQueue = merge.catch(() => {});
    await merge;
    notifyParkDataChanged();

    const [south, west, north, east] = city.bbox;
    for (let latID = Math.round(south / TILE_STEP); latID < Math.round(north / TILE_STEP); latID++) {
      for (let lonID = Math.round(west / TILE_STEP); lonID < Math.round(east / TILE_STEP); lonID++) {
        processedTiles.set(`${latID},${lonID}`, true);
      }
    }

    setLoadStep(2, "Saving parks...");
    await saveMergedParksToDB();
    await saveProcessedTilesToDB();
    await set(IMPORTED_CITIES_KEY, [...imported, city.id]);

    finishLoadProgress(`${parkData.length} parks loaded`);
  } catch (err) {
    failLoadProgress();
    console.error(`Failed to import preloaded city ${city.id}:`, err);
  }
}

// Cities whose bundled data overlaps the bbox are imported once, everything else falls back to normal fetching
function ensurePreloadedCities(bbox: [number, number, number, number]) {
  const [north, east, south, west] = bbox;
  const imports = PRELOADED_CITIES
    .filter(({ bbox: [cSouth, cWest, cNorth, cEast] }) => !(cSouth > north || cNorth < south || cWest > east || cEast < west))
    .map((city) => {
      if (!cityImports.has(city.id)) cityImports.set(city.id, importPreloadedCity(city));
      return cityImports.get(city.id)!;
    });
  return Promise.all(imports);
}

export async function updateParkData(bbox: [number, number, number, number]) {
  if (!initPromise) loadMergedParks();
  await initPromise;
  await ensurePreloadedCities(bbox);

  const id_bbox: [number, number, number, number] = [
    Math.floor(bbox[0] / TILE_STEP) + TILE_LOOKAHEAD, // the tile containing the north edge, ceil would also load the whole tile row beyond it
    Math.floor(bbox[1] / TILE_STEP) + TILE_LOOKAHEAD,
    Math.floor(bbox[2] / TILE_STEP) - TILE_LOOKAHEAD,
    Math.floor(bbox[3] / TILE_STEP) - TILE_LOOKAHEAD,
  ];

  // The bounding rectangle (in tile IDs) of all tiles that still need loading
  let missing: [number, number, number, number] | null = null; // [north, east, south, west]
  for (let latID = id_bbox[2]; latID <= id_bbox[0]; latID++) {
    for (let lonID = id_bbox[3]; lonID <= id_bbox[1]; lonID++) {
      if (processedTiles.get(`${latID},${lonID}`)) continue;
      missing = missing
        ? [Math.max(missing[0], latID), Math.max(missing[1], lonID), Math.min(missing[2], latID), Math.min(missing[3], lonID)]
        : [latID, lonID, latID, lonID];
    }
  }

  // Callers must also wait for loads started by earlier calls, otherwise they repaint before that data arrives
  if (!missing) {
    await Promise.all(pendingLoads);
    return;
  }

  const tileKeys: string[] = [];
  for (let latID = missing[2]; latID <= missing[0]; latID++) {
    for (let lonID = missing[3]; lonID <= missing[1]; lonID++) {
      const key = `${latID},${lonID}`;
      processedTiles.set(key, true);
      tileKeys.push(key);
    }
  }

  // Tile IDs are inclusive, so the region extends one TILE_STEP past the last ID
  const regionKey = `${missing[2]},${missing[3]},${missing[0]},${missing[1]}`;
  const toCoord = (id: number) => Math.round(id * TILE_STEP * 1e6) / 1e6; // avoid float noise like 0.30000000000000004
  const load = loadRegion(
    toCoord(missing[2]),
    toCoord(missing[3]),
    toCoord(missing[0] + 1),
    toCoord(missing[1] + 1),
    regionKey,
    tileKeys
  );
  pendingLoads.add(load);
  load.finally(() => pendingLoads.delete(load));
  await Promise.all(pendingLoads);
}

