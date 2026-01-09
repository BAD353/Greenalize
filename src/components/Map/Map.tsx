import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";

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
  const heatmapOverlayRef = useRef<L.ImageOverlay | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const heatmapExtraFactor = 0.2;
  let lastUpdate = performance.now();

  useEffect(() => {
    workerRef.current = createHeatmapWorker();

    workerRef.current.onmessage = (e: MessageEvent) => {
      if (!mapRef.current) return;

      const { imageDataArray, width, height, bounds } = e.data;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(new ImageData(imageDataArray, width, height), 0, 0);

      if (heatmapOverlayRef.current) {
        mapRef.current.removeLayer(heatmapOverlayRef.current);
      }

      heatmapOverlayRef.current = L.imageOverlay(
        canvas.toDataURL(),
        [
          [bounds.north, bounds.west],
          [bounds.south, bounds.east],
        ],
        { opacity: 1, interactive: false }
      ).addTo(mapRef.current);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat") || "41.38");
    const lng = parseFloat(params.get("lng") || "2.17");
    const zoom = parseInt(params.get("zoom") || "14", 10);

    mapRef.current = L.map("map", { zoomControl: false, zoomSnap: 1 }).setView([lat, lng], zoom);
    mapRef.current.setMinZoom(13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      updateWhenZooming: false,
      keepBuffer: 8,
      updateWhenIdle: false,
    }).addTo(mapRef.current);

    loadParks(showParks, showHeatmap);

    mapRef.current.on("moveend", () => {
      if (performance.now() - lastUpdate > 500) {
        lastUpdate = performance.now();
        loadParks(showParks, showHeatmap);
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
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
      const factor = 0.5;
      await updateParkData([
        north + latDist * factor,
        east + lonDist * factor,
        south - latDist * factor,
        west - lonDist * factor,
      ]);

      let parks = getBoundedParkData(
        north + latDist * factor,
        east + lonDist * factor,
        south - latDist * factor,
        west - lonDist * factor
      );

      const geojson: FeatureCollection<Polygon, { id: number; name: string; area: number }> = {
        type: "FeatureCollection",
        features: parks.map((park) => {
          const feature: Feature<Polygon, { id: number; name: string; area: number; bbox: any }> = {
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

      if (showHeatmap && parks.length && workerRef.current) {
        const mapSize = mapRef.current.getSize();
        const zoom = mapRef.current.getZoom();

        const coordStep = zoom <= 13 ? 0.005 : zoom === 14 ? 0.002 : zoom === 15 ? 0.001 : 0.0005;

        const latRange = north - south;
        const lngRange = east - west;

        const gridHeight = Math.ceil(latRange / coordStep);
        const gridWidth = Math.ceil(lngRange / coordStep);

        const coordGrid = Array.from({ length: gridHeight + 1 }, (_, gy) =>
          Array.from({ length: gridWidth + 1 }, (_, gx) => ({
            lat: north - gy * coordStep,
            lng: west + gx * coordStep,
          }))
        );

        workerRef.current.postMessage({
          parks: parks.map((p) => ({ coordinates: p.coordinates, area: p.area })),
          mapSize: { x: mapSize.x, y: mapSize.y },
          coordGrid,
          coordStep,
          bounds: { north, south, east, west },
          heatmapExtraFactor,
        });
      } else if (!showHeatmap && heatmapOverlayRef.current) {
        mapRef.current.removeLayer(heatmapOverlayRef.current);
        heatmapOverlayRef.current = null;
      }
    } catch (error) {
      console.error("Error drawing parks:", error);
    }
  }

  return (
    <div id="map" style={{ height: "100vh", width: "100vw", margin: 0, padding: 0, zIndex: "0" }} />
  );
}
