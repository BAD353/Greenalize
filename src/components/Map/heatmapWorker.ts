self.onmessage = (e: MessageEvent) => {
  const {
    parks,
    mapSize,
    coordGrid,
    coordStep,
    bounds,
    heatmapExtraFactor,
  } = e.data;

  const scale = 1 + 2 * heatmapExtraFactor;
  const outWidth = Math.round(mapSize.x * scale);
  const outHeight = Math.round(mapSize.y * scale);

  const latPad = (bounds.north - bounds.south) * heatmapExtraFactor;
  const lngPad = (bounds.east - bounds.west) * heatmapExtraFactor;

  const expandedBounds = {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    west: bounds.west - lngPad,
  };

  const gridHeight = coordGrid.length - 1;
  const gridWidth = coordGrid[0].length - 1;

  const scoreGrid = new Float32Array((gridWidth + 1) * (gridHeight + 1));

  const getGrid = (x: number, y: number) =>
    scoreGrid[y * (gridWidth + 1) + x];

  const minDist = 0.002;
  const distancePow = 1.5;
  const areaPow = 1.5;
  const minArea = 50;
  const maxArea = 10000;

  for (let gy = 0; gy <= gridHeight; gy++) {
    for (let gx = 0; gx <= gridWidth; gx++) {
      const { lat, lng } = coordGrid[gy][gx];
      let score = 0;

      for (const park of parks) {
        if (!park.area || park.area < minArea) continue;

        let minD = Infinity;
        const pts = park.coordinates;

        for (let i = 0; i < pts.length; i++) {
          const [lat1, lng1] = pts[i];
          const [lat2, lng2] = pts[(i + 1) % pts.length];
          minD = Math.min(
            minD,
            pointToSegmentDistance(lat, lng, lat1, lng1, lat2, lng2)
          );
        }

        score +=
          Math.pow(Math.min(park.area, maxArea), areaPow) /
          Math.pow(Math.max(minD, minDist), distancePow);
      }

      scoreGrid[gy * (gridWidth + 1) + gx] = score;
    }
  }

  const imageDataArray = new Uint8ClampedArray(outWidth * outHeight * 4);
  const latRange = expandedBounds.north - expandedBounds.south;
  const lngRange = expandedBounds.east - expandedBounds.west;

  for (let y = 0; y < outHeight; y++) {
    const lat = expandedBounds.north - (y / outHeight) * latRange;
    const gy = (bounds.north - lat) / coordStep;
    const gy1 = Math.floor(Math.max(0, Math.min(gridHeight - 1, gy)));
    const gy2 = gy1 + 1;
    const dy = gy - gy1;

    for (let x = 0; x < outWidth; x++) {
      const lng = expandedBounds.west + (x / outWidth) * lngRange;
      const gx = (lng - bounds.west) / coordStep;
      const gx1 = Math.floor(Math.max(0, Math.min(gridWidth - 1, gx)));
      const gx2 = gx1 + 1;
      const dx = gx - gx1;

      const f00 = getGrid(gx1, gy1);
      const f10 = getGrid(gx2, gy1);
      const f01 = getGrid(gx1, gy2);
      const f11 = getGrid(gx2, gy2);

      const score =
        (f00 * (1 - dx) + f10 * dx) * (1 - dy) +
        (f01 * (1 - dx) + f11 * dx) * dy;

      const ratio = Math.min(score / 2e11, 1);
      const [r, g, b] = hslToRgb(0.33 * ratio, 1, 0.5);

      const i = (y * outWidth + x) * 4;
      imageDataArray[i] = r;
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
  });
};

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hslToRgb(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [
    number,
    number,
    number
  ];
}
