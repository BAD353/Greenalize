import { writeFileSync } from "node:fs";
import { fetchMapData } from "../src/backend/mapData/fecthMapData";
import { encodeCityFile } from "../src/backend/mapData/cityFile";
import convertToParkList from "../src/utils/convertToPark";
import { mergeParks } from "../src/backend/mapData/mergeParks";
import { PRELOADED_CITIES } from "../src/utils/preloadedCities";

const TILE_STEP = 0.1;
// A dense city can be too much for one request of a busy server, EXPORT_SPLIT=2 asks for squares of half the size instead
const SPLIT = Number(process.env.EXPORT_SPLIT ?? 1);
const REQUEST_STEP = TILE_STEP / SPLIT;
const MAX_RETRIES = Number(process.env.EXPORT_RETRIES ?? 6);
const BASE_RETRY_MS = 2000;
const REQUEST_GAP_MS = 2000;

// Public servers refuse requests without a User-Agent, browsers send a Referer instead so the app does not need this.
// OVERPASS_SERVER (one or several URLs separated by commas) overrides the servers the app would pick, which is needed for
// a city the default server has no data for, as it answers such queries with an empty result.
const originalFetch = globalThis.fetch;
const forcedServers = (process.env.OVERPASS_SERVER ?? "").split(",").filter(Boolean);
let forcedCalls = 0;
globalThis.fetch = (input, init) =>
  originalFetch(forcedServers.length && String(input).includes("interpreter") ? forcedServers[forcedCalls++ % forcedServers.length] : input, {
    ...init,
    headers: { "User-Agent": "Greenalize-export/1.0", ...(init?.headers as Record<string, string>) },
  });

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const toCoord = (n: number) => Math.round(n * 1e6) / 1e6;

// Every retry goes to the next server, like the app does
async function fetchWithRetry(south: number, west: number, north: number, east: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchMapData(south, west, north, east, undefined, attempt);
    } catch (err: any) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = BASE_RETRY_MS * 2 ** Math.min(attempt, 4);
      console.warn(`  failed (${err?.status ?? err?.message}), retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

async function exportCity(id: string) {
  const city = PRELOADED_CITIES.find((c) => c.id === id);
  if (!city) throw new Error(`Unknown city "${id}". Known: ${PRELOADED_CITIES.map((c) => c.id).join(", ")}`);

  const [south, west, north, east] = city.bbox;
  const latTiles = Math.round((north - south) / REQUEST_STEP);
  const lonTiles = Math.round((east - west) / REQUEST_STEP);

  // An element that crosses a tile border comes back with both tiles
  const elements = new Map<string, any>();
  let rawBytes = 0;
  for (let i = 0; i < latTiles; i++) {
    for (let j = 0; j < lonTiles; j++) {
      const tile = [south + i * REQUEST_STEP, west + j * REQUEST_STEP, south + (i + 1) * REQUEST_STEP, west + (j + 1) * REQUEST_STEP].map(toCoord);
      console.log(`${city.name}: tile ${i * lonTiles + j + 1}/${latTiles * lonTiles} (${tile.join(", ")})`);
      const tileElements = await fetchWithRetry(tile[0], tile[1], tile[2], tile[3]);
      rawBytes += JSON.stringify(tileElements).length;
      tileElements.forEach((el: any) => elements.set(`${el.type}${el.id}`, el));
      await sleep(REQUEST_GAP_MS);
    }
  }

  // A server without data for the area answers with an empty result instead of an error
  if (!elements.size) throw new Error(`${city.name}: the server returned no parks at all, try another with OVERPASS_SERVER`);

  console.log(`${city.name}: converting ${elements.size} elements...`);
  const parks = mergeParks(convertToParkList([...elements.values()]));

  const json = JSON.stringify(encodeCityFile(city.id, city.bbox, parks));
  const outPath = `public${city.file}`;
  writeFileSync(outPath, json);
  console.log(
    `${city.name}: wrote ${parks.length} parks to ${outPath} (${(json.length / 1048576).toFixed(2)} MB, ` +
      `${(rawBytes / latTiles / lonTiles / SPLIT / SPLIT / 1048576).toFixed(2)} MB of compact JSON per tile downloaded)`
  );
}

async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids.length ? ids : ["barcelona"]) await exportCity(id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});