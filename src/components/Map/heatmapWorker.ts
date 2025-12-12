function pointToSegmentDistance(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function pointToPolygonDistance(
    lat: number, 
    lng: number, 
    parkCoords: [number, number][]
): number {
    let minDist = Infinity;
    
    for (let i = 0; i < parkCoords.length; i++) {
        const [lat1, lng1] = parkCoords[i];
        const [lat2, lng2] = parkCoords[(i + 1) % parkCoords.length];
        
        const dist = pointToSegmentDistance(lat, lng, lat1, lng1, lat2, lng2);
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}

function isPointInPolygon(
    lat: number, 
    lng: number, 
    parkCoords: [number, number][]
): boolean {
    let inside = false;
    for (let i = 0, j = parkCoords.length - 1; i < parkCoords.length; j = i++) {
        const [lati, lngi] = parkCoords[i];
        const [latj, lngj] = parkCoords[j];
        
        if ((lngi > lng) !== (lngj > lng) &&
            lat < ((latj - lati) * (lng - lngi)) / (lngj - lngi) + lati) {
            inside = !inside;
        }
    }
    return inside;
}


self.onmessage = function (e: MessageEvent) {
    const { parks, mapSize, latLngGrid, pixelStep } = e.data;

    const gridWidth = Math.ceil(mapSize.x / pixelStep);
    const gridHeight = Math.ceil(mapSize.y / pixelStep);

    const epsilon = 1e-9;

    // Flattened score grid
    const scoreGrid = new Float32Array((gridWidth + 1) * (gridHeight + 1));

    const getGrid = (gx: number, gy: number) =>
        scoreGrid[gy * (gridWidth + 1) + gx];

    // Compute scores at grid points
    let globalMaxScore = 0;
    const minDist = 0.002; 
    const distanceScalePow = 1.5; 
    const areaScalePow = 1.5; 
    const minArea = 50; 
    const maxArea = 10000; 

    for (let gy = 0; gy <= gridHeight; gy++) {
        for (let gx = 0; gx <= gridWidth; gx++) {
            const latLng = latLngGrid[gy][gx];

            let sumWeightedDist = 0;

            for (const park of parks) {
                if (park.area < minArea || park.area == undefined) continue;
                const inside = isPointInPolygon(latLng.lat, latLng.lng, park.coordinates);
                if (inside) {
                    sumWeightedDist += ( Math.pow(Math.min(park.area, maxArea),areaScalePow))/(Math.pow(minDist,distanceScalePow));  // If inside, set to area or 1
                    continue;
                }

                const dist = pointToPolygonDistance(latLng.lat, latLng.lng, park.coordinates);
                sumWeightedDist += ( Math.pow(Math.min(park.area, maxArea),areaScalePow))/Math.pow(Math.max(dist, minDist),distanceScalePow);
            }

            const score = (sumWeightedDist + epsilon);
            scoreGrid[gy * (gridWidth + 1) + gx] = score;

            if (score*0.8 > globalMaxScore) globalMaxScore = score*0.8;
        }
    }
    // Prepare pixel buffer
    const imageDataArray = new Uint8ClampedArray(mapSize.x * mapSize.y * 4);
    const invPixelStep = 1 / pixelStep;

    function hslToRgb(h: number, s: number, l: number) {
        // h in [0,1], s,l in [0,1]
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [
            Math.round(r * 255),
            Math.round(g * 255),
            Math.round(b * 255)
        ];
    }

    // Fill image by bilinear interpolation of score grid
    for (let y = 0; y < mapSize.y; y++) {
        const gy = y * invPixelStep;
        const gy1 = gy | 0;
        const gy2 = Math.min(gy1 + 1, gridHeight);
        const dy = gy - gy1;

        for (let x = 0; x < mapSize.x; x++) {
            const gx = x * invPixelStep;
            const gx1 = gx | 0;
            const gx2 = Math.min(gx1 + 1, gridWidth);
            const dx = gx - gx1;

            // Bilinear interpolation
            const f00 = getGrid(gx1, gy1);
            const f10 = getGrid(gx2, gy1);
            const f01 = getGrid(gx1, gy2);
            const f11 = getGrid(gx2, gy2);

            const v1 = f00 + (f10 - f00) * dx;
            const v2 = f01 + (f11 - f01) * dx;
            const score = v1 + (v2 - v1) * dy;

            const ratio = Math.min(score / globalMaxScore, 1);

            // Smooth gradient: green → yellow → red (0.33 → 0.0 hue in HSL)
            const hue = 0.33 * (ratio);
            const [r, g, b] = hslToRgb(hue, 1, 0.5);

            const idx = (y * mapSize.x + x) * 4;
            imageDataArray[idx] = r;
            imageDataArray[idx + 1] = g;
            imageDataArray[idx + 2] = b;
            imageDataArray[idx + 3] = 160;
        }
    }

    // Send it back
    self.postMessage({ imageDataArray, width: mapSize.x, height: mapSize.y });
};
