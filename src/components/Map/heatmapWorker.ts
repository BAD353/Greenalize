/// <reference lib="webworker" />
export {};
self.onmessage = (e: MessageEvent) => {
  const {
    parks, mapSize, coordGrid, coordStep, bounds, heatmapExtraFactor,
    areaPow, sigma, maxScore,
  } = e.data;

  const MAX_SCORE = maxScore;

  const scale = 1 + 2 * heatmapExtraFactor;
  const outWidth  = Math.round(mapSize.x * scale);
  const outHeight = Math.round(mapSize.y * scale);

  const latPad = (bounds.north - bounds.south) * heatmapExtraFactor;
  const lngPad = (bounds.east  - bounds.west)  * heatmapExtraFactor;
  const expandedBounds = {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east:  bounds.east  + lngPad,
    west:  bounds.west  - lngPad,
  };

  const gridHeight = coordGrid.length - 1;
  const gridWidth  = coordGrid[0].length - 1;
  const scoreGrid  = new Float32Array((gridWidth + 1) * (gridHeight + 1));

  const minDist    = 0;
  const maxDist    = 0.1;
  const minArea    = 1000;
  const maxArea    = 100000;

  const gridSize = (gridWidth + 1) * (gridHeight + 1);
  const gridLat = new Float64Array(gridSize);
  const gridLng = new Float64Array(gridSize);
  for (let gy = 0; gy <= gridHeight; gy++) {
    for (let gx = 0; gx <= gridWidth; gx++) {
      const idx = gy * (gridWidth + 1) + gx;
      gridLat[idx] = coordGrid[gy][gx].lat;
      gridLng[idx] = coordGrid[gy][gx].lng;
    }
  }

  const gridNorth = expandedBounds.north;
  const gridSouth = expandedBounds.south;
  const gridEast  = expandedBounds.east;
  const gridWest  = expandedBounds.west;

  for (const park of parks) {
    if (!park.area || park.area < minArea) continue;
    if (park.boundingBox === undefined) {
      console.warn("Park missing bounding box:", park);
      continue;
    }

    const [pNorth, pEast, pSouth, pWest] = park.boundingBox;
    const parkW = Math.max(pNorth - pSouth, pEast - pWest);

    const viewLatDist = Math.max(0, Math.max(pSouth - gridNorth, gridSouth - pNorth));
    const viewLngDist = Math.max(0, Math.max(pWest  - gridEast,  gridWest  - pEast));
    if (viewLatDist**2 + viewLngDist**2 > maxDist ** 2) continue;

    const scaledArea = Math.pow(Math.min(park.area, maxArea) / minArea, areaPow);

    let segCount = 0;
    for (const ring of park.outerRings) segCount += ring.length;
    const segs = new Float32Array(segCount * 4);
    let si = 0;
    for (const ring of park.outerRings) {
      for (let i = 0; i < ring.length; i++) {
        const [lat1, lng1] = ring[i];
        const [lat2, lng2] = ring[(i + 1) % ring.length];
        segs[si++] = lat1; segs[si++] = lng1;
        segs[si++] = lat2; segs[si++] = lng2;
      }
    }

    for (let idx = 0; idx < gridSize; idx++) {
      const lat = gridLat[idx];
      const lng = gridLng[idx];

      const latDist = Math.max(0, Math.max(pSouth - lat, lat - pNorth));
      const lngDist = Math.max(0, Math.max(pWest  - lng, lng - pEast));
      const bboxDist = Math.sqrt(latDist * latDist + lngDist * lngDist);
      if (bboxDist > maxDist) continue;

      let minD: number;

      if (bboxDist > 3 * parkW) {
        minD = Math.max(bboxDist, minDist);
      } else {
        minD = Infinity;
        for (let s = 0; s < segs.length; s += 4) {
          const d = pointToSegmentDistance(lat, lng, segs[s], segs[s+1], segs[s+2], segs[s+3]);
          if (d < minD) minD = d;
        }
        if (pointInPolygon(lat, lng, park.outerRings)) {
          minD = minDist;
        } else {
          minD = Math.max(minD, minDist);
        }
      }

      scoreGrid[idx] += scaledArea * Math.exp(- (minD**2) / (2 * sigma**2));
    }
  }

  const imageDataArray = new Uint8ClampedArray(outWidth * outHeight * 4);
  const latRange = expandedBounds.north - expandedBounds.south;
  const lngRange = expandedBounds.east  - expandedBounds.west;
  const getGrid = (x: number, y: number) => scoreGrid[y * (gridWidth + 1) + x];

  for (let y = 0; y < outHeight; y++) {
    const lat = expandedBounds.north - (y / outHeight) * latRange;
    const gy  = (bounds.north - lat) / coordStep;
    const gy1 = Math.floor(Math.max(0, Math.min(gridHeight - 1, gy)));
    const gy2 = gy1 + 1;
    const dy  = gy - gy1;
    for (let x = 0; x < outWidth; x++) {
      const lng = expandedBounds.west + (x / outWidth) * lngRange;
      const gx  = (lng - bounds.west) / coordStep;
      const gx1 = Math.floor(Math.max(0, Math.min(gridWidth - 1, gx)));
      const gx2 = gx1 + 1;
      const dx  = gx - gx1;
      const score =
        (getGrid(gx1, gy1) * (1 - dx) + getGrid(gx2, gy1) * dx) * (1 - dy) +
        (getGrid(gx1, gy2) * (1 - dx) + getGrid(gx2, gy2) * dx) * dy;
      const ratio = Math.pow(Math.min(score / MAX_SCORE, 1), 0.5);
      const [r, g, b] = hslToRgb(0.33 * ratio, 1, 0.5);
      const i = (y * outWidth + x) * 4;
      imageDataArray[i]     = r;
      imageDataArray[i + 1] = g;
      imageDataArray[i + 2] = b;
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