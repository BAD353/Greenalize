/// <reference lib="webworker" />
export {};

// Parks of this area get exactly the base half-distance, bigger ones reach further
const SIZE_REFERENCE_AREA = 10000;
const SIZE_DISTANCE_CAP_AREA = 1000000;
const MIN_SIZE_DISTANCE_FACTOR = 0.25;
const MAX_SIZE_DISTANCE_FACTOR = 3;

// A park's influence is 0.5^25 (about 3e-8) at this many half-distances, which no colour can show
const INFLUENCE_CUTOFF_FACTOR = 5;

// The heatmap is a smooth gradient, so rendering it at half size is invisible but 4x cheaper to draw and encode
const IMAGE_RESOLUTION = 0.5;

// Outline points closer than this share of a grid cell to the simplified outline are dropped
const SIMPLIFY_TOLERANCE_CELLS = 0.5;
const MIN_POINTS_TO_SIMPLIFY = 16;

const COLOR_STEPS = 256;

self.onmessage = (e: MessageEvent) => {
  const {
    parks, mapSize, gridWidth, gridHeight, coordStep, bounds, heatmapExtraFactor,
    areaPow, halfDistance, maxScore, autoSensitivity, autoGreenShare,
  } = e.data;


  const scale = 1 + 2 * heatmapExtraFactor;
  const outWidth  = Math.round(mapSize.x * scale * IMAGE_RESOLUTION);
  const outHeight = Math.round(mapSize.y * scale * IMAGE_RESOLUTION);

  const latPad = (bounds.north - bounds.south) * heatmapExtraFactor;
  const lngPad = (bounds.east  - bounds.west)  * heatmapExtraFactor;
  const expandedBounds = {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east:  bounds.east  + lngPad,
    west:  bounds.west  - lngPad,
  };

  const scoreGrid  = new Float32Array((gridWidth + 1) * (gridHeight + 1));

  const minDist    = 0;
  const minArea    = 1000;
  const minParkArea = 100;
  const maxArea    = 100000;

  // The grid is regular: cell (gx, gy) sits at lat = gridNorth - gy * coordStep, lng = gridWest + gx * coordStep
  const gridNorth = expandedBounds.north;
  const gridSouth = expandedBounds.south;
  const gridEast  = expandedBounds.east;
  const gridWest  = expandedBounds.west;

  for (const park of parks) {
    if (!park.area || park.area < minParkArea) continue;
    if (park.boundingBox === undefined) {
      console.warn("Park missing bounding box:", park);
      continue;
    }

    const [pNorth, pEast, pSouth, pWest] = park.boundingBox;
    const parkW = Math.max(pNorth - pSouth, pEast - pWest);

    const scaledArea = Math.pow(Math.min(park.area, maxArea) / minArea, areaPow);

    // Half-distance scales with park size (same importance setting as the score) and with how green the park is
    const sizeFactor = Math.min(
      MAX_SIZE_DISTANCE_FACTOR,
      Math.max(MIN_SIZE_DISTANCE_FACTOR, Math.pow(Math.min(park.area, SIZE_DISTANCE_CAP_AREA) / SIZE_REFERENCE_AREA, areaPow / 2))
    );
    const parkHalfDistance = halfDistance * sizeFactor * (park.greenness ?? 1);

    // Beyond this distance the influence is effectively zero, so only the cells around the park need visiting
    const cutoff = parkHalfDistance * INFLUENCE_CUTOFF_FACTOR;
    const gxMin = Math.max(0, Math.ceil((pWest - cutoff - gridWest) / coordStep));
    const gxMax = Math.min(gridWidth, Math.floor((pEast + cutoff - gridWest) / coordStep));
    const gyMin = Math.max(0, Math.ceil((gridNorth - (pNorth + cutoff)) / coordStep));
    const gyMax = Math.min(gridHeight, Math.floor((gridNorth - (pSouth - cutoff)) / coordStep));
    if (gxMin > gxMax || gyMin > gyMax) continue;

    // Detail finer than a grid cell cannot show up in the heatmap, so large outlines are simplified first
    const rings: number[][][] = park.outerRings.map((ring: number[][]) => simplifyRing(ring, coordStep * SIMPLIFY_TOLERANCE_CELLS));

    let segCount = 0;
    for (const ring of rings) segCount += ring.length;
    const segs = new Float32Array(segCount * 4);
    let si = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [lat1, lng1] = ring[i];
        const [lat2, lng2] = ring[(i + 1) % ring.length];
        segs[si++] = lat1; segs[si++] = lng1;
        segs[si++] = lat2; segs[si++] = lng2;
      }
    }

    for (let gy = gyMin; gy <= gyMax; gy++) {
      const lat = gridNorth - gy * coordStep;
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const lng = gridWest + gx * coordStep;

        const latDist = Math.max(0, Math.max(pSouth - lat, lat - pNorth));
        const lngDist = Math.max(0, Math.max(pWest  - lng, lng - pEast));
        const bboxDist = Math.sqrt(latDist * latDist + lngDist * lngDist);
        if (bboxDist > cutoff) continue;

        let minD: number;

        if (bboxDist > 3 * parkW) {
          minD = Math.max(bboxDist, minDist);
        } else if (bboxDist === 0 && pointInPolygon(lat, lng, rings)) {
          // Inside the park the distance is zero, no need to measure it to every edge
          minD = minDist;
        } else {
          minD = Infinity;
          for (let s = 0; s < segs.length; s += 4) {
            const d = pointToSegmentDistance(lat, lng, segs[s], segs[s+1], segs[s+2], segs[s+3]);
            if (d < minD) minD = d;
          }
          minD = Math.max(minD, minDist);
        }

        scoreGrid[gy * (gridWidth + 1) + gx] += scaledArea * Math.pow(0.5, (minD / parkHalfDistance) ** 2);
      }
    }
  }
  // With auto sensitivity, saturate at the score most of the map stays below so the view always has both green and red
  let MAX_SCORE = maxScore;
  if (autoSensitivity) {
    const sorted = Float32Array.from(scoreGrid).sort();
    const reference = sorted[Math.floor((1 - autoGreenShare) * (sorted.length - 1))];
    if (reference > 1e-6) MAX_SCORE = reference;
  }

  // Converting the colour for every pixel is slow, so the red to green scale is computed once
  const colorLut = new Uint8Array(COLOR_STEPS * 3);
  for (let i = 0; i < COLOR_STEPS; i++) {
    const [r, g, b] = hslToRgb(0.33 * (i / (COLOR_STEPS - 1)), 1, 0.5);
    colorLut[i * 3] = r;
    colorLut[i * 3 + 1] = g;
    colorLut[i * 3 + 2] = b;
  }

  const imageDataArray = new Uint8ClampedArray(outWidth * outHeight * 4);
  const latRange = expandedBounds.north - expandedBounds.south;
  const lngRange = expandedBounds.east  - expandedBounds.west;
  const getGrid = (x: number, y: number) => scoreGrid[y * (gridWidth + 1) + x];

  for (let y = 0; y < outHeight; y++) {
    const lat = expandedBounds.north - (y / outHeight) * latRange;
    const gy  = (expandedBounds.north - lat) / coordStep;
    const gy1 = Math.floor(Math.max(0, Math.min(gridHeight - 1, gy)));
    const gy2 = gy1 + 1;
    const dy  = gy - gy1;
    for (let x = 0; x < outWidth; x++) {
      const lng = expandedBounds.west + (x / outWidth) * lngRange;
      const gx  = (lng - expandedBounds.west) / coordStep;
      const gx1 = Math.floor(Math.max(0, Math.min(gridWidth - 1, gx)));
      const gx2 = gx1 + 1;
      const dx  = gx - gx1;
      const score =
        (getGrid(gx1, gy1) * (1 - dx) + getGrid(gx2, gy1) * dx) * (1 - dy) +
        (getGrid(gx1, gy2) * (1 - dx) + getGrid(gx2, gy2) * dx) * dy;
      const lutIndex = Math.round(Math.sqrt(Math.min(score / MAX_SCORE, 1)) * (COLOR_STEPS - 1)) * 3;
      const i = (y * outWidth + x) * 4;
      imageDataArray[i]     = colorLut[lutIndex];
      imageDataArray[i + 1] = colorLut[lutIndex + 1];
      imageDataArray[i + 2] = colorLut[lutIndex + 2];
      imageDataArray[i + 3] = 160;
    }
  }

  self.postMessage({
    imageDataArray,
    width: outWidth,
    height: outHeight,
    bounds: expandedBounds,
    scoreGrid: scoreGrid.buffer,
    gridWidth,
    gridHeight,
    coordStep,
  }, [scoreGrid.buffer, imageDataArray.buffer]);
};

// Douglas-Peucker, iterative so very long outlines cannot overflow the call stack
function simplifyRing(ring: number[][], tolerance: number): number[][] {
  const n = ring.length;
  if (n <= MIN_POINTS_TO_SIMPLIFY) return ring;

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointToSegmentDistance(ring[i][0], ring[i][1], ring[first][0], ring[first][1], ring[last][0], ring[last][1]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDist > tolerance) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return ring.filter((_, i) => keep[i]);
}

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointInPolygon(lat: number, lng: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [lat1, lng1] = ring[i];
      const [lat2, lng2] = ring[j];
      if ((lng1 > lng) !== (lng2 > lng) &&
          lat < (lat2 - lat1) * (lng - lng1) / (lng2 - lng1) + lat1) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}