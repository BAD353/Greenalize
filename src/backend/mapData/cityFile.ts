import type { Park } from "../../types/park";
import { createPark } from "../../utils/convertToPark";

// Preloaded city files only store what cannot be derived. Bounding box, area and center are recomputed on load, and
// coordinates are whole numbers of 1e-5 degrees (about 1 m) stored as the difference to the previous point, which makes
// the file about 4x smaller than plain JSON without losing any detail.
const COORD_SCALE = 1e5;

// [id, name or 0, tag table indexes, polygons -> rings -> [lat, lon, dLat, dLon, ...]]
type EncodedPark = [number, string | 0, number[], number[][][]];

export interface CityFile {
  v: 2;
  id: string;
  bbox: [number, number, number, number];
  tags: string[];
  parks: EncodedPark[];
}

export function encodeCityFile(id: string, bbox: CityFile["bbox"], parks: Park[]): CityFile {
  const tags: string[] = [];
  const tagIndex = (tag: string) => {
    let index = tags.indexOf(tag);
    if (index < 0) index = tags.push(tag) - 1;
    return index;
  };

  return {
    v: 2,
    id,
    bbox,
    tags,
    parks: parks.map((park) => [
      park.id,
      park.name ?? 0,
      park.tags.map(tagIndex),
      park.polygons.map((polygon) =>
        polygon.map((ring) => {
          const flat: number[] = [];
          let previousLat = 0;
          let previousLon = 0;
          for (const [lat, lon] of ring) {
            const scaledLat = Math.round(lat * COORD_SCALE);
            const scaledLon = Math.round(lon * COORD_SCALE);
            flat.push(scaledLat - previousLat, scaledLon - previousLon);
            previousLat = scaledLat;
            previousLon = scaledLon;
          }
          return flat;
        })
      ),
    ]),
  };
}

export function decodeCityFile(file: CityFile): Park[] {
  const parks: Park[] = [];

  for (const [id, name, tagIndexes, polygons] of file.parks) {
    const decoded = polygons.map((polygon) =>
      polygon.map((flat) => {
        const ring: [number, number][] = [];
        let lat = 0;
        let lon = 0;
        for (let i = 0; i < flat.length; i += 2) {
          lat += flat[i];
          lon += flat[i + 1];
          ring.push([lat / COORD_SCALE, lon / COORD_SCALE]);
        }
        return ring;
      })
    );
    const park = createPark(id, name || undefined, decoded, tagIndexes.map((i) => file.tags[i]));
    if (park) parks.push(park);
  }

  return parks;
}