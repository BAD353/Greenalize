import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";

let mapView: [[number, number], number] = [[41.38, 2.17], 14];

import workerCode from "./heatmapWorker.ts?raw";

// Create worker from inline code
function createHeatmapWorker() {
    return new Worker(new URL("./heatmapWorker.ts", import.meta.url), { type: "module" });
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
    const workerRef = useRef<Worker | null>(null);
    let lastUpdate = performance.now();

    useEffect(() => {
        // Initialize Web Worker
        workerRef.current = createHeatmapWorker();

        workerRef.current.onmessage = function (e: MessageEvent) {
            const { imageDataArray, width, height } = e.data;

            if (!mapRef.current) return;

            // Create canvas with the computed data
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d")!;

            const imageData = new ImageData(imageDataArray, width, height);
            ctx.putImageData(imageData, 0, 0);

            const mapSize = mapRef.current.getSize();
            const topLeft = mapRef.current.containerPointToLatLng([0, 0]);
            const bottomRight = mapRef.current.containerPointToLatLng([mapSize.x, mapSize.y]);

            // Remove old heatmap
            if (heatmapOverlayRef.current) {
                mapRef.current.removeLayer(heatmapOverlayRef.current);
                heatmapOverlayRef.current = null;
            }

            heatmapOverlayRef.current = L.imageOverlay(
                canvas.toDataURL(),
                [
                    [topLeft.lat, topLeft.lng],
                    [bottomRight.lat, bottomRight.lng],
                ],
                { opacity: 1, interactive: false }
            ).addTo(mapRef.current);

            heatmapCanvasRef.current = canvas;
        };

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

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

            if (showHeatmap && parks.length > 0 && workerRef.current) {
                const mapSize = mapRef.current.getSize();
                const pixelStep = 20;

                const gridWidth = Math.ceil(mapSize.x / pixelStep);
                const gridHeight = Math.ceil(mapSize.y / pixelStep);

                // Pre-calculate lat/lng for each grid point
                const latLngGrid: { lat: number; lng: number }[][] = [];
                for (let gy = 0; gy <= gridHeight; gy++) {
                    latLngGrid[gy] = [];
                    for (let gx = 0; gx <= gridWidth; gx++) {
                        const pixelX = gx * pixelStep;
                        const pixelY = gy * pixelStep;
                        const latLng = mapRef.current.containerPointToLatLng([pixelX, pixelY]);
                        latLngGrid[gy][gx] = { lat: latLng.lat, lng: latLng.lng };
                    }
                }

                // Send data to worker
                workerRef.current.postMessage({
                    parks: parks.map((p) => ({ coordinates: p.coordinates })),
                    mapSize: { x: mapSize.x, y: mapSize.y },
                    latLngGrid,
                });
            } else if (!showHeatmap && heatmapOverlayRef.current) {
                // Remove heatmap if it's turned off
                mapRef.current.removeLayer(heatmapOverlayRef.current);
                heatmapOverlayRef.current = null;
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
