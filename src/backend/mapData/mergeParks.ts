import type { Park } from "../../types/park";
import { area, booleanPointInPolygon, featureCollection, intersect, point } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

// Convert first outer ring to turf polygon for spatial tests
// Share of a park's area that must lie inside a bigger one for the two to be merged
const MERGE_AREA_THRESHOLD = 0.8;
// Cheap first check on the bounding boxes, the area test decides the rest
const MERGE_BBOX_PREFILTER = 0.5;
const MAX_SAMPLED_POINTS = 40;

function parkToTurfPolygon(park: Park): Feature<Polygon> | null {
  try {
    const outerRing = park.polygons[0][0];
    // Turf expects [lon, lat]; our internal format is [lat, lon]
    const coords = outerRing.map(([lat, lon]) => [lon, lat] as [number, number]);
    // Ensure ring is closed
    if (
      coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1]
    ) {
      coords.push(coords[0]);
    }
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
  } catch {
    return null;
  }
}

function bboxArea(bb: [number, number, number, number]): number {
  // [north, east, south, west]
  return (bb[0] - bb[2]) * (bb[1] - bb[3]);
}

/**
 * Decides whether `inner` lies in `outer` for at least MERGE_AREA_THRESHOLD of its area. A sample of the outline
 * settles the clear cases, all points inside means inside and none inside means outside. Only a partial overlap
 * needs the exact intersection, which is far slower.
 */
function isContainedIn(inner: Park, outer: Park): boolean {
  const outerPoly = parkToTurfPolygon(outer);
  const innerPoly = parkToTurfPolygon(inner);
  if (!outerPoly || !innerPoly) return false;

  const ring = inner.polygons[0][0];
  const step = Math.max(1, Math.floor(ring.length / MAX_SAMPLED_POINTS));
  let inside = 0;
  let sampled = 0;

  for (let i = 0; i < ring.length; i += step) {
    const [lat, lon] = ring[i];
    sampled++;
    try {
      if (booleanPointInPolygon(point([lon, lat]), outerPoly)) inside++;
    } catch {
      // A point that cannot be tested counts as outside
    }
  }

  if (inside === sampled) return true;
  if (inside === 0) return false;

  try {
    const innerArea = area(innerPoly);
    if (innerArea === 0) return false;
    const overlap = intersect(featureCollection([innerPoly, outerPoly]));
    return !!overlap && area(overlap) / innerArea >= MERGE_AREA_THRESHOLD;
  } catch {
    return false;
  }
}
/**
 * Fraction of bbox `inner` that lies inside bbox `outer` (0–1).
 * bbox format: [north, east, south, west]
 */
function bboxOverlapFraction(
  outer: [number, number, number, number],
  inner: [number, number, number, number]
): number {
  const height = Math.min(outer[0], inner[0]) - Math.max(outer[2], inner[2]);
  const width  = Math.min(outer[1], inner[1]) - Math.max(outer[3], inner[3]);
  if (height <= 0 || width <= 0) return 0;
  const innerArea = bboxArea(inner);
  return innerArea > 0 ? (height * width) / innerArea : 0;
}
function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  // [north, east, south, west]
  return !(a[1] < b[3] || a[3] > b[1] || a[0] < b[2] || a[2] > b[0]);
}

function tryMerge(a: Park, b: Park): Park | undefined {
  if (!bboxesOverlap(a.boundingBox, b.boundingBox)) return undefined;

  const aArea = bboxArea(a.boundingBox);
  const bArea = bboxArea(b.boundingBox);

  const [bigger, smaller] = aArea >= bArea ? [a, b] : [b, a];

  if (bboxOverlapFraction(bigger.boundingBox, smaller.boundingBox) < MERGE_BBOX_PREFILTER) return undefined;

  if (!isContainedIn(smaller, bigger)) return undefined;

  const mergedName = aArea >= bArea ? a.name : b.name;

  return {
    ...bigger,
    name: mergedName,
  };
}

export function mergeParks(input: Park[], onProgress?: (current: number, total: number) => void): Park[] {
  // Filter out parks with invalid bounding boxes
  const parks: Park[] = input.filter((p: Park) => p.boundingBox[0] !== -1);

  // Sort by area (bigger parks first)
  parks.sort((a, b) =>  b.area - a.area);

  const total = parks.length;
  const progressInterval = Math.max(10, Math.floor(total / 100));

  // sort by the west coordinate
  const sortedParks = [...parks].sort((a, b) => a.boundingBox[3] - b.boundingBox[3]);

  const merged: Park[] = [];
  const absorbed = new Array<boolean>(sortedParks.length).fill(false);
  for (let i = 0; i < sortedParks.length; i++) {
    if (absorbed[i]) continue;
    let current = sortedParks[i];
    let currentWasAbsorbed = false;

    for (let j = i + 1; j < sortedParks.length; j++) {
      if (absorbed[j]) continue;
      const candidate = sortedParks[j];
      // stop if we have passed the east edge of the current park
      if (candidate.boundingBox[3] > current.boundingBox[1]) break;

      const mergeResult = tryMerge(current, candidate);
      if (mergeResult) {
        const currentArea = bboxArea(current.boundingBox);
        const candidateArea = bboxArea(candidate.boundingBox);
        if (currentArea >= candidateArea) {
          absorbed[j] = true;
          current = mergeResult;
        } else {
          absorbed[i] = true;
          absorbed[j] = true;
          current = mergeResult;
          currentWasAbsorbed = true;
        }
      }
    }

    // current holds the merged result 
    merged.push(current);

    if (i % progressInterval === 0 || i === sortedParks.length - 1) {
      onProgress?.(i + 1, total);
    }
  }

  console.log(
    `Merging complete: ${total} input parks reduced to ${merged.length} merged parks.`
  );
  return merged;
}
