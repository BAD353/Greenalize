import type { Park } from "../types/park";
import polygonArea from "./polygonArea";

const MEANINGFUL_TAG_KEYS = ["leisure", "natural", "landuse", "amenity"];

/* ───────────────────────────────────────────────────────────── */
/* Utilities                                                     */
/* ───────────────────────────────────────────────────────────── */

function extractTags(tags?: Record<string, string>): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const k of MEANINGFUL_TAG_KEYS) {
    if (tags[k]) out.push(tags[k]);
  }
  return out;
}

function nodeToCoord(node: { lat: number; lon: number }): [number, number] {
  return [node.lat, node.lon];
}

function coordKey(lat: number, lon: number): number {
  // 1e6 precision is more than enough (~10cm)
  return (Math.round(lat * 1e6) << 20) ^ Math.round(lon * 1e6);
}

function closeRing(ring: [number, number][]) {
  const n = ring.length;
  if (n < 2) return;
  const [f0, f1] = ring[0];
  const [l0, l1] = ring[n - 1];
  if (f0 !== l0 || f1 !== l1) ring.push([f0, f1]);
}

function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][1] * ring[i + 1][0] - ring[i + 1][1] * ring[i][0];
  }
  return sum * 0.5;
}

function ensureWinding(ring: [number, number][], ccw: boolean) {
  if ((signedArea(ring) > 0) !== ccw) ring.reverse();
}

function ringBbox(ring: [number, number][]): [number, number, number, number] {
  let north = -Infinity, east = -Infinity;
  let south = Infinity, west = Infinity;

  for (const [lat, lon] of ring) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lon > east)  east  = lon;
    if (lon < west)  west  = lon;
  }
  return [north, east, south, west];
}

function mergeBboxes(
  a: [number, number, number, number],
  b: [number, number, number, number]
): [number, number, number, number] {
  return [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3])
  ];
}

/* ───────────────────────────────────────────────────────────── */
/* Ultra-light Ray Casting PIP                                  */
/* ───────────────────────────────────────────────────────────── */

function pointInRing(
  ptLat: number,
  ptLon: number,
  ring: [number, number][]
): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];

    const intersect =
      ((xi > ptLon) !== (xj > ptLon)) &&
      ptLat < (yj - yi) * (ptLon - xi) / (xj - xi) + yi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/* ───────────────────────────────────────────────────────────── */
/* Way Stitching (O(total_points))                              */
/* ───────────────────────────────────────────────────────────── */

type Coord = [number, number];
type Way = { geometry: { lat: number; lon: number }[] };

function stitchWaysIntoRings(ways: Way[]): Coord[][] {
  const segments: Coord[][] = ways
    .map(w => w.geometry?.map(nodeToCoord))
    .filter((g): g is Coord[] => !!g && g.length >= 2);

  if (!segments.length) return [];

  const keyOf = (c: Coord) => coordKey(c[0], c[1]);

  const endpointMap = new Map<number, number[]>();
  const used = new Array<boolean>(segments.length).fill(false);

  segments.forEach((seg, i) => {
    const startKey = keyOf(seg[0]);
    const endKey = keyOf(seg[seg.length - 1]);

    endpointMap.set(startKey, [...(endpointMap.get(startKey) ?? []), i]);
    endpointMap.set(endKey, [...(endpointMap.get(endKey) ?? []), i]);
  });

  const rings: Coord[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    let ring = [...segments[i]];
    used[i] = true;

    while (true) {
      const tail = ring[ring.length - 1];
      const candidates = endpointMap.get(keyOf(tail)) ?? [];

      // Find unused segment (not itself)
      const nextIdx = candidates.find(idx => !used[idx]);
      if (nextIdx === undefined) break;

      used[nextIdx] = true;
      const seg = segments[nextIdx];

      const forward = keyOf(seg[0]) === keyOf(tail);

      const toAppend = forward
        ? seg.slice(1)
        : seg.slice(0, -1).reverse();

      ring = ring.concat(toAppend);
    }

    if (ring.length >= 3) {
      rings.push(ring);
    }
  }

  return rings;
}


/* ───────────────────────────────────────────────────────────── */
/* Inner Assignment                                              */
/* ───────────────────────────────────────────────────────────── */

function assignInnerRings(
  outerRings: [number, number][][],
  innerRings: [number, number][][]
): [number, number][][][] {

  const outerBboxes = outerRings.map(ringBbox);
  const polygons = outerRings.map(r => [r]);

  for (const inner of innerRings) {
    const [lat, lon] = inner[0];

    for (let i = 0; i < outerRings.length; i++) {
      const [n, e, s, w] = outerBboxes[i];

      if (lat > n || lat < s || lon > e || lon < w) continue;

      if (pointInRing(lat, lon, outerRings[i])) {
        polygons[i].push(inner);
        break;
      }
    }
  }

  return polygons;
}

/* ───────────────────────────────────────────────────────────── */
/* Park Builder                                                  */
/* ───────────────────────────────────────────────────────────── */

function buildPark(
  id: number,
  polygons: [number, number][][][],
  tags?: Record<string, string>
): Park | null {

  if (!polygons.length) return null;

  let bbox = ringBbox(polygons[0][0]);

  let totalArea = 0;
  let centerLat = 0;
  let centerLon = 0;

  for (const poly of polygons) {
    bbox = mergeBboxes(bbox, ringBbox(poly[0]));

    const [area, cLat, cLon] = polygonArea(poly[0]);
    totalArea += area;
    centerLat += cLat;
    centerLon += cLon;
  }

  centerLat /= polygons.length;
  centerLon /= polygons.length;

  return {
    id,
    name: tags?.name,
    polygons,
    boundingBox: bbox,
    area: totalArea,
    center: [centerLat, centerLon],
    tags: extractTags(tags),
  };
}

/* ───────────────────────────────────────────────────────────── */
/* Main Converter                                                */
/* ───────────────────────────────────────────────────────────── */

export default function convertToParkList(elements: any[]): Park[] {

  const parks: Park[] = [];

  for (const element of elements) {

    if (element.type === "way") {
      if (!element.geometry?.length) continue;

      const ring = element.geometry.map(nodeToCoord);

      const park = buildPark(element.id, [[ring]], element.tags);
      if (park) {
        parks.push(park);
      }
      continue;
    }

    else if (element.type === "relation") {
      const members = element.members ?? [];

      const outerWays = members.filter(m => m.role === "outer" && m.geometry?.length);
      if (!outerWays.length) continue;

      const innerWays = members.filter(m => m.role === "inner" && m.geometry?.length);

      const outerRings = stitchWaysIntoRings(outerWays);
      const innerRings = stitchWaysIntoRings(innerWays);

      const polygons = assignInnerRings(outerRings, innerRings);

      const park = buildPark(element.id, polygons, element.tags);
      if (park) parks.push(park);
    }
  }
  console.log(parks);
  return parks;
}
