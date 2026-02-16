import type { Park } from "../../types/park";
import { polygon, bboxPolygon, booleanContains, booleanWithin, union } from "@turf/turf";

function parkToPolygon(park: Park) {
  try {
    return polygon([park.coordinates]);
  } catch {
    return null;
  }
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  // [north, east, south, west] - early exit if bounding boxes don't intersect
  return !(a[1] < b[3] || a[3] > b[1] || a[0] < b[2] || a[2] > b[0]);
}

function mergeGivenParks(a: Park, b: Park): Park | undefined {
  if (!bboxesOverlap(a.boundingBox, b.boundingBox)) return undefined;

  const polyA = parkToPolygon(a);
  const polyB = parkToPolygon(b);
  if (!polyA || !polyB) return undefined;

  const bboxA = bboxPolygon(a.boundingBox);
  const bboxB = bboxPolygon(b.boundingBox);

  // If one park fully contains the other, keep the larger one
  if (booleanContains(bboxA, bboxB) && booleanWithin(polyB, polyA)) return a;
  if (booleanContains(bboxB, bboxA) && booleanWithin(polyA, polyB)) return b;

  try {
    // @ts-ignore
    const mergedPoly = union(polyA, polyB);
    if (!mergedPoly) return undefined;

    const mergedCoords = mergedPoly.geometry.coordinates[0] as [number, number][];
    const mergedBBox: [number, number, number, number] = mergedPoly.bbox ?? [
      mergedCoords.reduce((max, c) => Math.max(max, c[1]), -Infinity), // north
      mergedCoords.reduce((max, c) => Math.max(max, c[0]), -Infinity), // east
      mergedCoords.reduce((min, c) => Math.min(min, c[1]), Infinity),  // south
      mergedCoords.reduce((min, c) => Math.min(min, c[0]), Infinity),  // west
    ];

    return { ...a, coordinates: mergedCoords, boundingBox: mergedBBox };
  } catch {
    return undefined;
  }
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
  // Filter out parks with invalid bounding boxes before processing
  const parks: Park[] = event.data.filter((p: Park) => p.boundingBox[0] !== -1);
  const merged: Park[] = [];
  const total = parks.length;
  const progressInterval = Math.max(10, Math.floor(total / 100));

  for (let i = 0; i < total; i++) {
    let currentPark = parks[i];
    let didMerge = true;

    // Keep trying to merge until no more overlaps are found
    while (didMerge) {
      didMerge = false;
      for (let j = merged.length - 1; j >= 0; j--) {
        const mergedPark = mergeGivenParks(currentPark, merged[j]);
        if (mergedPark) {
          currentPark = mergedPark;
          merged.splice(j, 1);
          didMerge = true;
        }
      }
    }

    merged.push(currentPark);

    if (i % progressInterval === 0 || i === total - 1) {
      postProgress(i + 1, total);
    }
  }

  (self as any).postMessage({ type: "result", data: merged });
};