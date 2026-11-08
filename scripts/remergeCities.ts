import { readFileSync, writeFileSync } from "node:fs";
import { decodeCityFile, encodeCityFile } from "../src/backend/mapData/cityFile";
import { mergeParks } from "../src/backend/mapData/mergeParks";
import { PRELOADED_CITIES } from "../src/utils/preloadedCities";

// Applies the current merge rules to the preloaded files again without downloading anything
const ids = process.argv.slice(2);
for (const city of PRELOADED_CITIES.filter((c) => !ids.length || ids.includes(c.id))) {
  const path = `public${city.file}`;
  const parks = decodeCityFile(JSON.parse(readFileSync(path, "utf8")));
  const merged = mergeParks(parks);
  const json = JSON.stringify(encodeCityFile(city.id, city.bbox, merged));
  writeFileSync(path, json);
  console.log(`${city.name}: ${parks.length} -> ${merged.length} parks (${(json.length / 1048576).toFixed(2)} MB)`);
}