import toast from "react-hot-toast";
import type { Park } from "../../types/park";
import convertToParkList from "../../utils/convertToPark";
import { fetchMapData } from "./fecthMapData";
import { set, get, keys, delMany } from "idb-keyval";
import { isDeleted, clearDeletedParks } from "./deletedParks";
import { PRELOADED_CITIES, type PreloadedCity } from "../../utils/preloadedCities";
import { startLoadProgress, setLoadStep, setLoadSubProgress, setLoadDescription, setLoadDownload, finishLoadProgress, failLoadProgress } from "./loadProgress";
import { readJsonWithProgress } from "./readJsonWithProgress";
import { decodeCityFile, type CityFile } from "./cityFile";

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

// Overpass asks to pause for 30 seconds after an error, so tiles that failed are left alone for a while
const TILE_RETRY_COOLDOWN_MS = 30000;
// Regions are limited to this many tiles per side, so one request stays small and a long pan can drop the rest
const MAX_REGION_TILES_PER_SIDE = 3;

const tileRetryAfter: Map<string, number> = new Map();
let wantedTiles: [number, number, number, number] | null = null; // [north, east, south, west] tile ids of the latest view
// Requests go out one at a time, the public servers limit what a single user may send in parallel
let requestQueue: Promise<unknown> = Promise.resolve();

class SkippedLoad extends Error {}

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(task);
  requestQueue = result.catch(() => {});
  return result;
}

// A queued region is dropped when the view has moved on and none of its tiles are near it any more
function isStillWanted(tileKeys: string[]) {
  if (!wantedTiles) return true;
  const [north, east, south, west] = wantedTiles;
  return tileKeys.some((key) => {
    const [latID, lonID] = key.split(",").map(Number);
    return latID >= south && latID <= north && lonID >= west && lonID <= east;
  });
}

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
    tileRetryAfter.clear();
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
    return await fetchMapData(south, west, north, east, setLoadDownload, attempt);
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
      data = await enqueueRequest(() => {
        if (!isStillWanted(tileKeys)) throw new SkippedLoad();
        return fetchWithRetry(latStart, lonStart, latEnd, lonEnd);
      });
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
    tileKeys.forEach((k) => processedTiles.set(k, false)); // Mark as failed so it can be loaded again later
    if (err instanceof SkippedLoad) return;
    tileKeys.forEach((k) => tileRetryAfter.set(k, Date.now() + TILE_RETRY_COOLDOWN_MS));

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
  // The marker includes the area, so a city whose preloaded area grew is imported again
  const importMarker = `${city.id}:${city.bbox.join(",")}`;
  const imported: string[] = (await get(IMPORTED_CITIES_KEY)) ?? [];
  if (imported.includes(importMarker) && parkData.length > 0) return;

  startLoadProgress();
  setLoadDescription(`Loading ${city.name}...`);
  try {
    const response = await fetch(city.file);
    if (!response.ok) throw new Error(`Failed to fetch ${city.file}`);
    const parks = decodeCityFile((await readJsonWithProgress(response, setLoadDownload)) as CityFile);

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
    await set(IMPORTED_CITIES_KEY, [...imported, importMarker]);

    finishLoadProgress(`${parkData.length} parks loaded`);
  } catch (err) {
    failLoadProgress();
    console.error(`Failed to import preloaded city ${city.id}:`, err);
  }
}

function ensureCityImported(city: PreloadedCity) {
  if (!cityImports.has(city.id)) cityImports.set(city.id, importPreloadedCity(city));
  return cityImports.get(city.id)!;
}

// Cities whose bundled data overlaps the bbox are imported once, everything else falls back to normal fetching
function ensurePreloadedCities(bbox: [number, number, number, number]) {
  const [north, east, south, west] = bbox;
  const imports = PRELOADED_CITIES
    .filter(({ bbox: [cSouth, cWest, cNorth, cEast] }) => !(cSouth > north || cNorth < south || cWest > east || cEast < west))
    .map(ensureCityImported);
  return Promise.all(imports);
}

type TileRegion = { latStart: number; latEnd: number; lonStart: number; lonEnd: number };

// Splits tiles into rectangles that contain only the given tiles, so a tile that is loaded or loading is never downloaded
// again, then cuts the rectangles down to a size that fits in one request
function groupIntoRegions(tiles: [number, number][]): TileRegion[] {
  const rows = new Map<number, number[]>();
  tiles.forEach(([latID, lonID]) => rows.set(latID, [...(rows.get(latID) ?? []), lonID]));

  const rectangles: TileRegion[] = [];
  let open = new Map<string, TileRegion>(); // rectangles that can still grow into the next row
  for (const latID of [...rows.keys()].sort((a, b) => a - b)) {
    const lons = rows.get(latID)!.sort((a, b) => a - b);
    const nextOpen = new Map<string, TileRegion>();

    for (let i = 0; i < lons.length; ) {
      let j = i;
      while (j + 1 < lons.length && lons[j + 1] === lons[j] + 1) j++;

      const runKey = `${lons[i]},${lons[j]}`;
      const rectangle = open.get(runKey);
      if (rectangle && rectangle.latEnd === latID - 1) {
        rectangle.latEnd = latID;
        nextOpen.set(runKey, rectangle);
      } else {
        const created = { latStart: latID, latEnd: latID, lonStart: lons[i], lonEnd: lons[j] };
        rectangles.push(created);
        nextOpen.set(runKey, created);
      }
      i = j + 1;
    }
    open = nextOpen;
  }

  const regions: TileRegion[] = [];
  for (const r of rectangles) {
    for (let latStart = r.latStart; latStart <= r.latEnd; latStart += MAX_REGION_TILES_PER_SIDE) {
      for (let lonStart = r.lonStart; lonStart <= r.lonEnd; lonStart += MAX_REGION_TILES_PER_SIDE) {
        regions.push({
          latStart,
          latEnd: Math.min(latStart + MAX_REGION_TILES_PER_SIDE - 1, r.latEnd),
          lonStart,
          lonEnd: Math.min(lonStart + MAX_REGION_TILES_PER_SIDE - 1, r.lonEnd),
        });
      }
    }
  }
  return regions;
}

export async function updateParkData(bbox: [number, number, number, number], onlyPreloadedCityId?: string) {
  if (!initPromise) loadMergedParks();
  await initPromise;

  // A preloaded city page never downloads anything, the bundled file is all there is
  if (onlyPreloadedCityId) {
    const city = PRELOADED_CITIES.find((c) => c.id === onlyPreloadedCityId);
    if (city) await ensureCityImported(city);
    return;
  }

  await ensurePreloadedCities(bbox);

  const id_bbox: [number, number, number, number] = [
    Math.floor(bbox[0] / TILE_STEP) + TILE_LOOKAHEAD, // the tile containing the north edge, ceil would also load the whole tile row beyond it
    Math.floor(bbox[1] / TILE_STEP) + TILE_LOOKAHEAD,
    Math.floor(bbox[2] / TILE_STEP) - TILE_LOOKAHEAD,
    Math.floor(bbox[3] / TILE_STEP) - TILE_LOOKAHEAD,
  ];

  wantedTiles = id_bbox;

  const now = Date.now();
  const missing: [number, number][] = [];
  for (let latID = id_bbox[2]; latID <= id_bbox[0]; latID++) {
    for (let lonID = id_bbox[3]; lonID <= id_bbox[1]; lonID++) {
      const key = `${latID},${lonID}`;
      if (processedTiles.get(key) || (tileRetryAfter.get(key) ?? 0) > now) continue;
      missing.push([latID, lonID]);
    }
  }

  const toCoord = (id: number) => Math.round(id * TILE_STEP * 1e6) / 1e6; // avoid float noise like 0.30000000000000004
  for (const region of groupIntoRegions(missing)) {
    const tileKeys: string[] = [];
    for (let latID = region.latStart; latID <= region.latEnd; latID++) {
      for (let lonID = region.lonStart; lonID <= region.lonEnd; lonID++) {
        processedTiles.set(`${latID},${lonID}`, true);
        tileKeys.push(`${latID},${lonID}`);
      }
    }

    // Tile IDs are inclusive, so the region extends one TILE_STEP past the last ID
    const load = loadRegion(
      toCoord(region.latStart),
      toCoord(region.lonStart),
      toCoord(region.latEnd + 1),
      toCoord(region.lonEnd + 1),
      `${region.latStart},${region.lonStart},${region.latEnd},${region.lonEnd}`,
      tileKeys
    );
    pendingLoads.add(load);
    load.finally(() => pendingLoads.delete(load));
  }

  // Callers must also wait for loads started by earlier calls, otherwise they repaint before that data arrives
  await Promise.all(pendingLoads);
}

