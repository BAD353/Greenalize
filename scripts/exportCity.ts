import { writeFileSync } from "node:fs";
import { fetchMapData } from "../src/backend/mapData/fecthMapData";
import convertToParkList from "../src/utils/convertToPark";
import { mergeParks } from "../src/backend/mapData/mergeParks";
import { PRELOADED_CITIES } from "../src/utils/preloadedCities";

const TILE_STEP = 0.1;
const MAX_RETRIES = 4;
const BASE_RETRY_MS = 2000;
const REQUEST_GAP_MS = 2000;
const COORD_DECIMALS = 5;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const round = (n: number) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;
const toCoord = (n: number) => Math.round(n * 1e6) / 1e6;

async function fetchWithRetry(south: number, west: number, north: number, east: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchMapData(south, west, north, east);
    } catch (err: any) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = BASE_RETRY_MS * 2 ** attempt;
      console.warn(`  failed (${err?.status ?? err?.message}), retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

async function exportCity(id: string) {
  const city = PRELOADED_CITIES.find((c) => c.id === id);
  if (!city) throw new Error(`Unknown city "${id}". Known: ${PRELOADED_CITIES.map((c) => c.id).join(", ")}`);

  const [south, west, north, east] = city.bbox;
  const latTiles = Math.round((north - south) / TILE_STEP);
  const lonTiles = Math.round((east - west) / TILE_STEP);

  const elements: any[] = [];
  for (let i = 0; i < latTiles; i++) {
    for (let j = 0; j < lonTiles; j++) {
      const tile = [south + i * TILE_STEP, west + j * TILE_STEP, south + (i + 1) * TILE_STEP, west + (j + 1) * TILE_STEP].map(toCoord);
      console.log(`Fetching tile ${i * lonTiles + j + 1}/${latTiles * lonTiles} (${tile.join(", ")})`);
      elements.push(...(await fetchWithRetry(tile[0], tile[1], tile[2], tile[3])));
      await sleep(REQUEST_GAP_MS);
    }
  }

  console.log(`Converting ${elements.length} elements...`);
  const parks = mergeParks(convertToParkList(elements));

  const roundedParks = parks.map((p) => ({
    ...p,
    polygons: p.polygons.map((poly) => poly.map((ring) => ring.map(([lat, lon]) => [round(lat), round(lon)]))),
  }));

  const outPath = `public${city.file}`;
  writeFileSync(outPath, JSON.stringify({ id: city.id, bbox: city.bbox, parks: roundedParks }));
  console.log(`Wrote ${roundedParks.length} parks to ${outPath}`);
}

exportCity(process.argv[2] ?? "barcelona").catch((err) => {
  console.error(err);
  process.exit(1);
});