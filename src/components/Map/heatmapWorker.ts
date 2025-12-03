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

function bilinearInterpolate(
    x: number,
    y: number,
    x1: number,
    x2: number,
    y1: number,
    y2: number,
    q11: number,
    q12: number,
    q21: number,
    q22: number
): number {
    const r1 = ((x2 - x) / (x2 - x1)) * q11 + ((x - x1) / (x2 - x1)) * q21;
    const r2 = ((x2 - x) / (x2 - x1)) * q12 + ((x - x1) / (x2 - x1)) * q22;
    return ((y2 - y) / (y2 - y1)) * r1 + ((y - y1) / (y2 - y1)) * r2;
}

self.onmessage = function(e: MessageEvent) {
    const { parks, mapSize, latLngGrid } = e.data;
    
    const pixelStep = 20;
    const gridWidth = Math.ceil(mapSize.x / pixelStep);
    const gridHeight = Math.ceil(mapSize.y / pixelStep);
    const maxDistanceDegrees = 0.002;
    
    // Calculate distances at grid points
    const distanceGrid: number[][] = [];
    
    for (let gy = 0; gy <= gridHeight; gy++) {
        distanceGrid[gy] = [];
        for (let gx = 0; gx <= gridWidth; gx++) {
            const latLng = latLngGrid[gy][gx];
            
            let minDistance = Infinity;
            let isInside = false;
            
            for (const park of parks) {
                if (isPointInPolygon(latLng.lat, latLng.lng, park.coordinates)) {
                    isInside = true;
                    minDistance = 0;
                    break;
                }
                
                const dist = pointToPolygonDistance(latLng.lat, latLng.lng, park.coordinates);
                minDistance = Math.min(minDistance, dist);
            }
            
            distanceGrid[gy][gx] = isInside ? 0 : minDistance;
        }
    }
    
    // Create image data
    const imageDataArray = new Uint8ClampedArray(mapSize.x * mapSize.y * 4);
    
    for (let y = 0; y < mapSize.y; y++) {
        for (let x = 0; x < mapSize.x; x++) {
            const gx = x / pixelStep;
            const gy = y / pixelStep;
            
            const gx1 = Math.floor(gx);
            const gx2 = Math.min(Math.ceil(gx), gridWidth);
            const gy1 = Math.floor(gy);
            const gy2 = Math.min(Math.ceil(gy), gridHeight);
            
            let distance: number;
            if (gx1 === gx2 && gy1 === gy2) {
                distance = distanceGrid[gy1][gx1];
            } else if (gx1 === gx2) {
                distance = distanceGrid[gy1][gx1] + (distanceGrid[gy2][gx1] - distanceGrid[gy1][gx1]) * (gy - gy1);
            } else if (gy1 === gy2) {
                distance = distanceGrid[gy1][gx1] + (distanceGrid[gy1][gx2] - distanceGrid[gy1][gx1]) * (gx - gx1);
            } else {
                distance = bilinearInterpolate(
                    gx, gy,
                    gx1, gx2, gy1, gy2,
                    distanceGrid[gy1][gx1],
                    distanceGrid[gy2][gx1],
                    distanceGrid[gy1][gx2],
                    distanceGrid[gy2][gx2]
                );
            }
            
            const ratio = Math.min(distance / maxDistanceDegrees, 1);
            const idx = (y * mapSize.x + x) * 4;
            
            if (ratio < 0.2) {
                imageDataArray[idx] = 0;
                imageDataArray[idx + 1] = 255;
                imageDataArray[idx + 2] = 0;
                imageDataArray[idx + 3] = 153;
            } else if (ratio < 0.4) {
                imageDataArray[idx] = 140;
                imageDataArray[idx + 1] = 255;
                imageDataArray[idx + 2] = 0;
                imageDataArray[idx + 3] = 153;
            } else if (ratio < 0.6) {
                imageDataArray[idx] = 255;
                imageDataArray[idx + 1] = 255;
                imageDataArray[idx + 2] = 0;
                imageDataArray[idx + 3] = 153;
            } else if (ratio < 0.8) {
                imageDataArray[idx] = 255;
                imageDataArray[idx + 1] = 136;
                imageDataArray[idx + 2] = 0;
                imageDataArray[idx + 3] = 153;
            } else {
                imageDataArray[idx] = 255;
                imageDataArray[idx + 1] = 0;
                imageDataArray[idx + 2] = 0;
                imageDataArray[idx + 3] = 153;
            }
        }
    }
    
    // Send the computed image data back
    self.postMessage({ imageDataArray, width: mapSize.x, height: mapSize.y });
};