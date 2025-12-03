import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";

let mapView: [[number, number], number] = [[41.38, 2.17], 14];

// Calculate distance from point to line segment
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

// Calculate minimum distance from point to polygon
function pointToPolygonDistance(lat: number, lng: number, parkCoords: [number, number][]): number {
    let minDist = Infinity;
    
    for (let i = 0; i < parkCoords.length; i++) {
        const [lat1, lng1] = parkCoords[i];
        const [lat2, lng2] = parkCoords[(i + 1) % parkCoords.length];
        
        const dist = pointToSegmentDistance(lat, lng, lat1, lng1, lat2, lng2);
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}

// Check if point is inside polygon
function isPointInPolygon(lat: number, lng: number, parkCoords: [number, number][]): boolean {
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

// Get color based on distance
function getHeatmapColor(distanceDegrees: number, maxDistanceDegrees: number): string {
    const ratio = Math.min(distanceDegrees / maxDistanceDegrees, 1);
    
    if (ratio < 0.2) return "rgba(0, 255, 0, 0.6)";
    if (ratio < 0.4) return "rgba(140, 255, 0, 0.6)";
    if (ratio < 0.6) return "rgba(255, 255, 0, 0.6)";
    if (ratio < 0.8) return "rgba(255, 136, 0, 0.6)";
    return "rgba(255, 0, 0, 0.6)";
}

// Bilinear interpolation
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

export default function Map({
    showHeatmap,
    showParks,
}: {
    showHeatmap: boolean;
    showParks: boolean;
}) {
    const mapRef = useRef<L.Map | null>(null);
    const parksLayerRef = useRef<L.GeoJSON | null>(null);
    const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const heatmapOverlayRef = useRef<L.ImageOverlay | null>(null);
    let lastUpdate = performance.now();

    useEffect(() => {
        if (mapRef.current) return;

        const params = new URLSearchParams(window.location.search);
        const lat = parseFloat(params.get("lat") || "41.38");
        const lng = parseFloat(params.get("lng") || "2.17");
        const zoom = parseInt(params.get("zoom") || "14", 10);

        mapRef.current = L.map("map").setView([lat, lng], zoom);
        mapRef.current.setMinZoom(13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
        }).addTo(mapRef.current);

        loadParks(showParks, showHeatmap);

        function updateURL() {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const zoom = mapRef.current.getZoom();
            const newParams = new URLSearchParams(window.location.search);

            newParams.set("lat", center.lat.toFixed(5));
            newParams.set("lng", center.lng.toFixed(5));
            newParams.set("zoom", zoom.toString());

            const newUrl = `${window.location.pathname}?${newParams.toString()}`;
            window.history.replaceState({}, "", newUrl);
        }

        mapRef.current.on("moveend", () => {
            if (performance.now() - lastUpdate > 500) {
                lastUpdate = performance.now();
                loadParks(showParks, showHeatmap);
            }
            updateURL();
        });

        mapRef.current.on("zoomend", updateURL);

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [showParks, showHeatmap]);

    async function loadParks(showParks: boolean, showHeatmap: boolean) {
        if (!mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();

        try {
            const latDist = north - south;
            const lonDist = east - west;
            const factor = 0;
            await updateParkData([
                north + latDist * factor,
                east + lonDist * factor,
                south - latDist * factor,
                west - lonDist * factor,
            ]);

            let parks = getBoundedParkData(north, east, south, west);

            const geojson: FeatureCollection<Polygon, { id: number; name: string; area: number }> =
                {
                    type: "FeatureCollection",
                    features: parks.map((park) => {
                        const feature: Feature<
                            Polygon,
                            { id: number; name: string; area: number; bbox: any }
                        > = {
                            type: "Feature",
                            geometry: {
                                type: "Polygon",
                                coordinates: [park.coordinates.map(([lat, lng]) => [lng, lat])],
                            },
                            properties: {
                                id: park.id,
                                name: park.name ?? "",
                                area: park.area ?? -1,
                                bbox: park.boundingBox,
                            },
                        };
                        return feature;
                    }),
                };

            if (parksLayerRef.current) {
                mapRef.current!.removeLayer(parksLayerRef.current);
            }

            if (showParks) {
                parksLayerRef.current = L.geoJSON(geojson, {
                    style: (feature) => ({
                        color: "green",
                        fillColor: getParkColorByArea(feature?.properties?.area),
                        weight: 1,
                        fillOpacity: 0.5,
                    }),
                    onEachFeature: (feature, layer) => {
                        let id: string = `<strong>ID:</strong> ${feature.properties?.id}<br>`;
                        let name: string =
                            feature.properties?.name.length > 3
                                ? `<strong>Name:</strong> ${feature.properties?.name}<br>`
                                : "";
                        let area: string = `<strong>Area:</strong> ${Math.round(
                            feature.properties?.area
                        )} m²<br>`;
                        layer.bindPopup(id + name + area);
                    },
                }).addTo(mapRef.current);
            }

            // Remove old heatmap
            if (heatmapOverlayRef.current) {
                mapRef.current.removeLayer(heatmapOverlayRef.current);
                heatmapOverlayRef.current = null;
            }

            if (showHeatmap && parks.length > 0) {
                const mapSize = mapRef.current.getSize();
                const pixelStep = 20; // Calculate distance every 10 pixels
                
                const gridWidth = Math.ceil(mapSize.x / pixelStep);
                const gridHeight = Math.ceil(mapSize.y / pixelStep);
                
                // Calculate distances at grid points
                const distanceGrid: number[][] = [];
                const maxDistanceDegrees = 0.002; // Approximately 200m
                
                for (let gy = 0; gy <= gridHeight; gy++) {
                    distanceGrid[gy] = [];
                    for (let gx = 0; gx <= gridWidth; gx++) {
                        const pixelX = gx * pixelStep;
                        const pixelY = gy * pixelStep;
                        const latLng = mapRef.current.containerPointToLatLng([pixelX, pixelY]);
                        
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
                
                // Create canvas and interpolate
                const canvas = document.createElement('canvas');
                canvas.width = mapSize.x;
                canvas.height = mapSize.y;
                const ctx = canvas.getContext('2d')!;
                const imageData = ctx.createImageData(mapSize.x, mapSize.y);
                
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
                            imageData.data[idx] = 0;
                            imageData.data[idx + 1] = 255;
                            imageData.data[idx + 2] = 0;
                            imageData.data[idx + 3] = 153;
                        } else if (ratio < 0.4) {
                            imageData.data[idx] = 140;
                            imageData.data[idx + 1] = 255;
                            imageData.data[idx + 2] = 0;
                            imageData.data[idx + 3] = 153;
                        } else if (ratio < 0.6) {
                            imageData.data[idx] = 255;
                            imageData.data[idx + 1] = 255;
                            imageData.data[idx + 2] = 0;
                            imageData.data[idx + 3] = 153;
                        } else if (ratio < 0.8) {
                            imageData.data[idx] = 255;
                            imageData.data[idx + 1] = 136;
                            imageData.data[idx + 2] = 0;
                            imageData.data[idx + 3] = 153;
                        } else {
                            imageData.data[idx] = 255;
                            imageData.data[idx + 1] = 0;
                            imageData.data[idx + 2] = 0;
                            imageData.data[idx + 3] = 153;
                        }
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                const topLeft = mapRef.current.containerPointToLatLng([0, 0]);
                const bottomRight = mapRef.current.containerPointToLatLng([mapSize.x, mapSize.y]);
                
                heatmapOverlayRef.current = L.imageOverlay(
                    canvas.toDataURL(),
                    [[topLeft.lat, topLeft.lng], [bottomRight.lat, bottomRight.lng]],
                    { opacity: 1, interactive: false }
                ).addTo(mapRef.current);
                
                heatmapCanvasRef.current = canvas;
            }
        } catch (error) {
            console.error("Error drawing parks:", error);
        }
    }

    return (
        <div
            id="map"
            style={{ height: "100vh", width: "100vw", margin: 0, padding: 0, zIndex: "0" }}
        />
    );
}