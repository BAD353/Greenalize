import type { Park } from "../../types/park";
import { booleanPointInPolygon, point, booleanContains } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

// Convert first outer ring to turf polygon for spatial tests
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
 * Check if ALL sampled points of `inner` lie inside `outer` using turf.
 * We sample a subset of points for speed.
 */
function isContainedIn(inner: Park, outer: Park): boolean {
  const outerPoly = parkToTurfPolygon(outer);
  if (!outerPoly) return false;

  const ring = inner.polygons[0][0];
  // Sample up to 12 points evenly
  const step = Math.max(1, Math.floor(ring.length / 12));

  for (let i = 0; i < ring.length; i += step) {
    const [lat, lon] = ring[i];
    try {
      if (!booleanPointInPolygon(point([lon, lat]), outerPoly)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Check bounding box containment: does bbox `a` fully contain bbox `b`?
 * bbox format: [north, east, south, west]
 */
function bboxContains(
  outer: [number, number, number, number],
  inner: [number, number, number, number]
): boolean {
  return (
    outer[0] >= inner[0] && // outer.north >= inner.north
    outer[1] >= inner[1] && // outer.east  >= inner.east
    outer[2] <= inner[2] && // outer.south <= inner.south
    outer[3] <= inner[3]   // outer.west  <= inner.west
  );
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  // [north, east, south, west]
  return !(a[1] < b[3] || a[3] > b[1] || a[0] < b[2] || a[2] > b[0]);
}

/**
 * Try to merge two parks.
 * Rules:
 *  - Both have names → no merge
 *  - Name of merged result = whichever park has a name (or undefined)
 *  - One must be fully contained in the other (by bbox first, then point-in-polygon)
 *  - Result shape = the bigger park's shape
 */
function tryMerge(a: Park, b: Park): Park | undefined {
  if (!bboxesOverlap(a.boundingBox, b.boundingBox)) return undefined;

  const aArea = bboxArea(a.boundingBox);
  const bArea = bboxArea(b.boundingBox);

  // Determine candidate outer/inner by bbox area
  const [bigger, smaller] = aArea >= bArea ? [a, b] : [b, a];

  // Fast bbox containment check first
  if (!bboxContains(bigger.boundingBox, smaller.boundingBox)) return undefined;

  // Precise containment check: all sampled points of smaller inside bigger
  if (!isContainedIn(smaller, bigger)) return undefined;

  const mergedName = aArea >= bArea ? a.name : b.name;

  // Result = bigger park's geometry, with merged name
  return {
    ...bigger,
    name: mergedName,
  };
}

function postProgress(current: number, total: number) {
  const percent = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round(barLength * (current / total));
  const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
  (self as any).postMessage({
    type: "progress",
    progress: percent,
    text: `[${bar}] ${percent}% (${current}/${total})`,
  });
}

self.onmessage = async (event) => {
  // Filter out parks with invalid bounding boxes
  const parks: Park[] = event.data.filter((p: Park) => p.boundingBox[0] !== -1);

  // Sort by area (bigger parks first)
  parks.sort((a, b) =>  b.area - a.area);

  const total = parks.length;
  const progressInterval = Math.max(10, Math.floor(total / 100));

  // sort by the west coordinate
  const sortedParks = [...parks].sort((a, b) => a.boundingBox[3] - b.boundingBox[3]);

  const merged: Park[] = [];
  const absorbed = new Set<Park>();

  for (let i = 0; i < sortedParks.length; i++) {
    if (absorbed.has(sortedParks[i])) continue;

    let current = sortedParks[i];
    let currentWasAbsorbed = false;

    for (let j = i + 1; j < sortedParks.length; j++) {
      const candidate = sortedParks[j];
      if (absorbed.has(candidate)) continue;

      // stop if we have passed the east edge
      if (candidate.boundingBox[3] > current.boundingBox[1]) break;

      const mergeResult = tryMerge(current, candidate);
      if (mergeResult) {
        const currentArea = bboxArea(current.boundingBox);
        const candidateArea = bboxArea(candidate.boundingBox);
        if (currentArea >= candidateArea) {
          absorbed.add(candidate);
          current = mergeResult;
        } else {
          absorbed.add(sortedParks[i]);
          absorbed.add(candidate);
          current = mergeResult;
          currentWasAbsorbed = true;
        }
      }
    }

    // current holds the merged result 
    merged.push(current);

    if (i % progressInterval === 0 || i === sortedParks.length - 1) {
      postProgress(i + 1, total);
    }
  }

  console.log(
    `Merging complete: ${total} input parks reduced to ${merged.length} merged parks.`
  );
  (self as any).postMessage({ type: "result", data: merged });
};