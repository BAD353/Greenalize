import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";
import type { DeletedPark } from "../../backend/mapData/deletedParks";

const HEATMAP_EXTRA_FACTOR = 0.2;
const MOVE_DEBOUNCE_MS = 500;

export interface MapHandle {
  refresh: () => void;
}

function createHeatmapWorker() {
  return new Worker(new URL("./heatmapWorker.ts", import.meta.url), { type: "module" });
}

const Map = forwardRef<MapHandle, {
  showHeatmap: boolean;
  showParks: boolean;
  onDeletePark: (park: DeletedPark) => void;
  refreshKey: number;
}>(function Map({ showHeatmap, showParks, onDeletePark, refreshKey }, ref) {
  const mapRef = useRef<L.Map | null>(null);
  const parksLayerRef = useRef<L.GeoJSON | null>(null);
  const heatmapOverlayRef = useRef<L.ImageOverlay | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const lastMoveRef = useRef<number>(performance.now());

  const showParksRef = useRef(showParks);
  const showHeatmapRef = useRef(showHeatmap);
  useEffect(() => { showParksRef.current = showParks; }, [showParks]);
  useEffect(() => { showHeatmapRef.current = showHeatmap; }, [showHeatmap]);

  const onDeleteParkRef = useRef(onDeletePark);
  useEffect(() => { onDeleteParkRef.current = onDeletePark; }, [onDeletePark]);

  const redrawParksRef = useRef<() => void>(() => {});

  useImperativeHandle(ref, () => ({
    refresh: () => redrawParksRef.current(),
  }), []);

  // ─── Map init ────────────────────────────────────────────────────────────────

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

    fetchAndLoad();

    mapRef.current.on("moveend", () => {
      const now = performance.now();
      if (now - lastMoveRef.current > MOVE_DEBOUNCE_MS) {
        lastMoveRef.current = now;
        fetchAndLoad();
      }
    });

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [showParks, showHeatmap]);

  // Redraws whenever the parent increments refreshKey (delete or restore)
  useEffect(() => {
    if (!mapRef.current) return;
    redrawParksRef.current();
  }, [refreshKey]);

  // ─── Heatmap worker ───────────────────────────────────────────────────────────

  function spawnHeatmapWorker(payload: object) {
    // Kill the previous worker so its queued/running computation is discarded
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const worker = createHeatmapWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if (!mapRef.current) return;
      const { imageDataArray, width, height, bounds } = e.data;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.putImageData(new ImageData(imageDataArray, width, height), 0, 0);

      if (heatmapOverlayRef.current) mapRef.current.removeLayer(heatmapOverlayRef.current);
      heatmapOverlayRef.current = L.imageOverlay(
        canvas.toDataURL(),
        [[bounds.north, bounds.west], [bounds.south, bounds.east]],
        { opacity: 1, interactive: false }
      ).addTo(mapRef.current);
    };

    worker.postMessage(payload);
  }

  // ─── Popup helpers ────────────────────────────────────────────────────────────

  function buildTagChips(tags: string[]): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;";
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.textContent = tag;
      chip.style.cssText = `
        background: var(--green-background); color: var(--green);
        border-radius: 999px; font-size: 0.75rem;
        font-weight: bold; padding: 2px 8px;
      `;
      row.appendChild(chip);
    }
    return row;
  }

  function buildPopupContent(feature: Feature<Polygon, any>): HTMLDivElement {
    const { id, name, area, tags } = feature.properties;
    const hasName = name?.length > 3;

    const container = document.createElement("div");
    container.style.cssText = "display:flex; flex-direction:column; gap:4px;";

    const idLine = document.createElement("span");
    idLine.innerHTML = `<strong>ID:</strong> ${id}`;

    const areaLine = document.createElement("span");
    areaLine.innerHTML = `<strong>Area:</strong> ${Math.round(area)} m²`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete park";
    deleteBtn.style.cssText = `
      margin-top: 6px; padding: 4px 8px;
      background: var(--red-background, #fde8e8); color: var(--red, #c0392b);
      border: none; border-radius: 5px; font-weight: bold; cursor: pointer;
    `;
    deleteBtn.onclick = () => {
      onDeleteParkRef.current({ id, name: hasName ? name : `Park ${id}`, area, tags: tags ?? [] });
      mapRef.current?.closePopup();
      // Redraw immediately via ref — parent's refreshKey effect will also fire shortly after
      redrawParksRef.current();
    };

    if (hasName) {
      const nameLine = document.createElement("span");
      nameLine.innerHTML = `<strong>Name:</strong> ${name}`;
      container.appendChild(nameLine);
    }
    container.appendChild(idLine);
    container.appendChild(areaLine);
    if (tags?.length) container.appendChild(buildTagChips(tags));
    container.appendChild(deleteBtn);

    return container;
  }

  // ─── Draw helpers ─────────────────────────────────────────────────────────────

  function getExpandedBounds(factor = 0.5) {
    const b = mapRef.current!.getBounds();
    const north = b.getNorth(), south = b.getSouth();
    const east = b.getEast(),  west  = b.getWest();
    const latD = north - south, lngD = east - west;
    return {
      north: north + latD * factor, south: south - latD * factor,
      east:  east  + lngD * factor, west:  west  - lngD * factor,
      viewNorth: north, viewSouth: south, viewEast: east, viewWest: west,
    };
  }

  function paintLayers(parks: ReturnType<typeof getBoundedParkData>, bounds: ReturnType<typeof getExpandedBounds>) {
    if (!mapRef.current) return;
    const { viewNorth, viewSouth, viewEast, viewWest } = bounds;

    if (parksLayerRef.current) mapRef.current.removeLayer(parksLayerRef.current);
    parksLayerRef.current = null;

    if (showParksRef.current) {
      const geojson: FeatureCollection<Polygon, any> = {
        type: "FeatureCollection",
        features: parks.map((park) => ({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [park.coordinates.map(([lat, lng]) => [lng, lat])],
          },
          properties: {
            id: park.id, name: park.name ?? "",
            area: park.area ?? -1, tags: park.tags ?? [],
            bbox: park.boundingBox,
          },
        })),
      };

      parksLayerRef.current = L.geoJSON(geojson, {
        style: (feature) => ({
          color: "green",
          fillColor: getParkColorByArea(feature?.properties?.area),
          weight: 1,
          fillOpacity: 0.5,
        }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(buildPopupContent(feature));
        },
      }).addTo(mapRef.current);
    }

    if (showHeatmapRef.current && parks.length) {
      const mapSize = mapRef.current.getSize();
      const zoom = mapRef.current.getZoom();

      // Coarser grid at low zoom for performance, finer grid when zoomed in
      const coordStep =
        zoom <= 13 ? 0.005 :
        zoom === 14 ? 0.002 :
        zoom === 15 ? 0.001 : 0.0005;

      const latRange = viewNorth - viewSouth;
      const lngRange = viewEast - viewWest;

      const coordGrid = Array.from({ length: Math.ceil(latRange / coordStep) + 1 }, (_, gy) =>
        Array.from({ length: Math.ceil(lngRange / coordStep) + 1 }, (_, gx) => ({
          lat: viewNorth - gy * coordStep,
          lng: viewWest + gx * coordStep,
        }))
      );

      spawnHeatmapWorker({
        parks: parks.map((p) => ({ coordinates: p.coordinates, area: p.area })),
        mapSize: { x: mapSize.x, y: mapSize.y },
        coordGrid, coordStep,
        bounds: { north: viewNorth, south: viewSouth, east: viewEast, west: viewWest },
        heatmapExtraFactor: HEATMAP_EXTRA_FACTOR,
      });
    } else if (!showHeatmapRef.current && heatmapOverlayRef.current) {
      workerRef.current?.terminate();
      workerRef.current = null;
      mapRef.current.removeLayer(heatmapOverlayRef.current);
      heatmapOverlayRef.current = null;
    }
  }

  // ─── Entry points ─────────────────────────────────────────────────────────────

  // Lightweight: re-filters in-memory data and repaints without fetching tiles
  function redrawParks() {
    if (!mapRef.current) return;
    const bounds = getExpandedBounds();
    const parks = getBoundedParkData(bounds.north, bounds.east, bounds.south, bounds.west);
    paintLayers(parks, bounds);
  }

  // Keep the ref pointing to the freshest closure after every render
  redrawParksRef.current = redrawParks;

  // Full load: fetches any missing tiles then repaints - used on init and moveend
  async function fetchAndLoad() {
    if (!mapRef.current) return;
    const bounds = getExpandedBounds();
    try {
      await updateParkData([bounds.north, bounds.east, bounds.south, bounds.west]);
      const parks = getBoundedParkData(bounds.north, bounds.east, bounds.south, bounds.west);
      paintLayers(parks, bounds);
    } catch (error) {
      console.error("Error loading parks:", error);
    }
  }

  return (
    <div id="map" style={{ height: "100vh", width: "100vw", margin: 0, padding: 0, zIndex: "0" }} />
  );
});

export default Map;