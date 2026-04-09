import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData, getAvailableTags, getParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";
import type { DeletedPark } from "../../backend/mapData/deletedParks";
import type { Park } from "../../types/park";

const HEATMAP_EXTRA_FACTOR = 0.2;
const MOVE_DEBOUNCE_MS = 500;

export interface HeatmapParams {
  /** How much park size influences the score (0.1 = nearly flat, 1 = linear) */
  areaPow: number;
  /** How far the green glow spreads in degrees (~0.001 = tight, ~0.02 = wide) */
  sigma: number;
  /** Score at which the colour saturates to full green */
  maxScore: number;
}

export const DEFAULT_HEATMAP_PARAMS: HeatmapParams = {
  areaPow: 0.5,
  sigma: 0.005,
  maxScore: 100,
};

export interface MapHandle {
  refresh: () => void;
  exportPng: () => void;
}

function createHeatmapWorker() {
  return new Worker(new URL("./heatmapWorker.ts", import.meta.url), { type: "module" });
}

type MapProps = {
  showHeatmap: boolean;
  showParks: boolean;
  onDeletePark: (park: DeletedPark) => void;
  refreshKey: number;
  activeTags: string[];
  onTagsAvailable: (tags: string[]) => void;
  heatmapParams?: HeatmapParams;
};

// Stores the last computed score grid so map clicks can sample it
interface ScoreGridSnapshot {
  grid: Float32Array;
  gridWidth: number;
  gridHeight: number;
  bounds: { north: number; south: number; east: number; west: number };
  coordStep: number;
}

const Map = forwardRef<MapHandle, MapProps>(
  function Map(
    { showHeatmap, showParks, onDeletePark, refreshKey, activeTags, onTagsAvailable, heatmapParams },
    ref
  ) {
  const mapRef = useRef<L.Map | null>(null);
  const parksLayerRef = useRef<L.GeoJSON | null>(null);
  const heatmapOverlayRef = useRef<L.ImageOverlay | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastMoveRef = useRef<number>(performance.now());

  // Holds the latest score grid for click sampling
  const scoreGridSnapshotRef = useRef<ScoreGridSnapshot | null>(null);
  // Holds the greenness popup so we can close/replace it
  const greenPopupRef = useRef<L.Popup | null>(null);
  // Monotonically increasing counter — each new heatmap request bumps this,
  // and the worker callback checks it matches before swapping the overlay.
  const heatmapGenRef = useRef<number>(0);
  // Holds the latest rendered heatmap data URL so it can be exported as PNG.
  const heatmapDataUrlRef = useRef<string | null>(null);

  const showParksRef = useRef(showParks);
  const showHeatmapRef = useRef(showHeatmap);
  useEffect(() => { showParksRef.current = showParks; }, [showParks]);
  useEffect(() => { showHeatmapRef.current = showHeatmap; }, [showHeatmap]);

  const activeTagsRef = useRef(activeTags);
  useEffect(() => { activeTagsRef.current = activeTags; }, [activeTags]);

  const heatmapParamsRef = useRef<HeatmapParams>(heatmapParams ?? DEFAULT_HEATMAP_PARAMS);
  useEffect(() => { heatmapParamsRef.current = heatmapParams ?? DEFAULT_HEATMAP_PARAMS; }, [heatmapParams]);

  const onDeleteParkRef = useRef(onDeletePark);
  useEffect(() => { onDeleteParkRef.current = onDeletePark; }, [onDeletePark]);

  const onTagsAvailableRef = useRef(onTagsAvailable);
  useEffect(() => { onTagsAvailableRef.current = onTagsAvailable; }, [onTagsAvailable]);

  const redrawParksRef = useRef<() => void>(() => {});

  async function exportMapPng() {
    if (!mapRef.current) return;

    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    const { width, height } = mapEl.getBoundingClientRect();
    const out = document.createElement("canvas");
    out.width = Math.round(width);
    out.height = Math.round(height);
    const ctx = out.getContext("2d")!;

    // ── 1. Tile layer — re-fetch visible tiles with crossOrigin to avoid canvas taint ──
    const tilePane = mapEl.querySelector(".leaflet-tile-pane") as HTMLElement | null;
    if (tilePane) {
      const mapRect = mapEl.getBoundingClientRect();
      const tiles = Array.from(tilePane.querySelectorAll<HTMLImageElement>(".leaflet-tile"));
      await Promise.all(tiles.map((tile) => new Promise<void>((resolve) => {
        const rect = tile.getBoundingClientRect();
        const dx = rect.left - mapRect.left;
        const dy = rect.top  - mapRect.top;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try { ctx.drawImage(img, dx, dy, rect.width, rect.height); } catch {}
          resolve();
        };
        img.onerror = () => resolve();
        // Cache-bust so the browser re-requests with the CORS header
        img.src = tile.src.includes("?") ? tile.src + "&_cors=1" : tile.src + "?_cors=1";
      })));
    }

    // ── 2. Heatmap overlay (our own canvas data URL — no CORS issues) ──
    const dataUrl = heatmapDataUrlRef.current;
    if (dataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // The overlay covers the full expanded bounds; we need to position it
          // relative to the current map view using Leaflet's projection.
          const overlayLayer = heatmapOverlayRef.current;
          if (overlayLayer && mapRef.current) {
            const bounds = overlayLayer.getBounds();
            const nw = mapRef.current.latLngToContainerPoint(bounds.getNorthWest());
            const se = mapRef.current.latLngToContainerPoint(bounds.getSouthEast());
            ctx.drawImage(img, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
    }

    // ── 3. Build filename: "map-<city>-<lat>,<lng>-z<zoom>.png" ──
    const center = mapRef.current.getCenter();
    const zoom   = mapRef.current.getZoom();
    const lat    = center.lat.toFixed(4);
    const lng    = center.lng.toFixed(4);

    // Reverse-geocode to get a city name (best-effort; falls back to coords)
    let place = `${lat},${lng}`;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address ?? {};
        const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? "";
        if (city) place = city.toLowerCase().replace(/\s+/g, "-");
      }
    } catch {}

    const filename = `map-${place}-z${zoom}.png`;

    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = filename;
    a.click();
  }

  useImperativeHandle(ref, () => ({
    refresh: () => redrawParksRef.current(),
    exportPng: () => exportMapPng(),
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

    // Click handler — sample the score grid and show a greenness popup
    mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
      if (!showHeatmapRef.current) return;
      const snap = scoreGridSnapshotRef.current;
      if (!snap) return;

      const { lat, lng } = e.latlng;
      const score = sampleScoreGrid(snap, lat, lng);
      const MAX_SCORE = 1e2;
      const ratio = Math.pow(Math.min(score / MAX_SCORE, 1), 0.5);
      const pct = Math.round(ratio * 100);

      // Pick a label based on the score
      const label = `${score}`;

      if (greenPopupRef.current) {
        mapRef.current?.closePopup(greenPopupRef.current);
      }

      // greenPopupRef.current = L.popup({ className: "greenness-popup" })
      //   .setLatLng(e.latlng)
      //   .setContent(buildGreennessPopup(pct, label))
      //   .openOn(mapRef.current!);
    });

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

  useEffect(() => {
    if (!mapRef.current) return;
    redrawParksRef.current();
  }, [refreshKey, activeTags, heatmapParams]);

  // ─── Score grid sampling ──────────────────────────────────────────────────────

  function sampleScoreGrid(snap: ScoreGridSnapshot, lat: number, lng: number): number {
    const { grid, gridWidth, gridHeight, bounds, coordStep } = snap;
    const getGrid = (x: number, y: number) => grid[y * (gridWidth + 1) + x];

    const gy  = (bounds.north - lat) / coordStep;
    const gy1 = Math.floor(Math.max(0, Math.min(gridHeight - 1, gy)));
    const gy2 = Math.min(gridHeight, gy1 + 1);
    const dy  = gy - gy1;

    const gx  = (lng - bounds.west) / coordStep;
    const gx1 = Math.floor(Math.max(0, Math.min(gridWidth - 1, gx)));
    const gx2 = Math.min(gridWidth, gx1 + 1);
    const dx  = gx - gx1;

    return (
      (getGrid(gx1, gy1) * (1 - dx) + getGrid(gx2, gy1) * dx) * (1 - dy) +
      (getGrid(gx1, gy2) * (1 - dx) + getGrid(gx2, gy2) * dx) * dy
    );
  }

  // ─── Greenness popup content ──────────────────────────────────────────────────

  function buildGreennessPopup(pct: number, label: string): HTMLDivElement {
    const container = document.createElement("div");
    container.style.cssText = "display:flex; flex-direction:column; gap:6px; min-width:140px;";

    const title = document.createElement("span");
    title.style.cssText = "font-weight:bold; font-size:0.95rem;";
    title.textContent = label;

    const barOuter = document.createElement("div");
    barOuter.style.cssText = `
      width: 100%; height: 8px; border-radius: 999px;
      background: #e0e0e0; overflow: hidden;
    `;
    const barInner = document.createElement("div");
    // Interpolate bar color from red → yellow → green
    const hue = Math.round(pct * 1.2); // 0→red, 120→green
    barInner.style.cssText = `
      width: ${pct}%; height: 100%; border-radius: 999px;
      background: hsl(${hue}, 80%, 45%); transition: width 0.3s;
    `;
    barOuter.appendChild(barInner);

    const scoreLine = document.createElement("span");
    scoreLine.style.cssText = "font-size:0.8rem; color:#666;";
    scoreLine.textContent = `Greenness: ${pct}%`;

    container.appendChild(title);
    container.appendChild(barOuter);
    container.appendChild(scoreLine);
    return container;
  }

  // ─── Heatmap worker ───────────────────────────────────────────────────────────

interface HeatmapWorkerPayload {
  parks: {
    outerRings: [number, number][][];
    area: number;
    boundingBox: [number, number, number, number];
    id: string | number;
  }[];
  mapSize: { x: number; y: number };
  coordGrid: { lat: number; lng: number }[][];
  coordStep: number;
  bounds: { north: number; south: number; east: number; west: number };
  heatmapExtraFactor: number;
  areaPow: number;
  sigma: number;
  maxScore: number;
}

  function spawnHeatmapWorker(payload: HeatmapWorkerPayload) {
    // Terminate any in-flight worker — but do NOT remove the existing overlay yet.
    // The old overlay stays visible until the new one is ready (no flash).
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // Stamp this request so stale callbacks from previous workers are ignored.
    const gen = ++heatmapGenRef.current;

    const worker = createHeatmapWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      // Discard results that belong to a superseded request.
      if (gen !== heatmapGenRef.current) return;
      if (!mapRef.current) return;

      const { imageDataArray, width, height, bounds, scoreGrid, gridWidth, gridHeight, coordStep } = e.data;

      // Update the score grid snapshot for click-sampling.
      scoreGridSnapshotRef.current = {
        grid: new Float32Array(scoreGrid),
        gridWidth,
        gridHeight,
        bounds: payload.bounds,
        coordStep: payload.coordStep,
      };

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.putImageData(new ImageData(imageDataArray, width, height), 0, 0);

      const dataUrl = canvas.toDataURL();
      heatmapDataUrlRef.current = dataUrl;

      // Swap overlays: add new one first, then remove old — eliminates the blank flash.
      const newOverlay = L.imageOverlay(
        dataUrl,
        [[bounds.north, bounds.west], [bounds.south, bounds.east]],
        { opacity: 1, interactive: false }
      ).addTo(mapRef.current);

      if (heatmapOverlayRef.current) {
        mapRef.current.removeLayer(heatmapOverlayRef.current);
      }
      heatmapOverlayRef.current = newOverlay;
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

  function buildPopupContent(feature: Feature<MultiPolygon, any>): HTMLDivElement {
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

  // ─── GeoJSON conversion ───────────────────────────────────────────────────────

  function parkToFeature(park: Park): Feature<MultiPolygon, any> {
    return {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: park.polygons.map((polygon) =>
          polygon.map((ring) => ring.map(([lat, lon]) => [lon, lat]))
        ),
      },
      properties: {
        id: park.id,
        name: park.name ?? "",
        area: park.area ?? -1,
        tags: park.tags ?? [],
        bbox: park.boundingBox,
      },
    };
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

  function paintLayers(parks: Park[], bounds: ReturnType<typeof getExpandedBounds>) {
    if (!mapRef.current) return;
    const { viewNorth, viewSouth, viewEast, viewWest } = bounds;

    if (parksLayerRef.current) mapRef.current.removeLayer(parksLayerRef.current);
    parksLayerRef.current = null;

    if (showParksRef.current) {
      const geojson: FeatureCollection<MultiPolygon, any> = {
        type: "FeatureCollection",
        features: parks.map(parkToFeature),
      };

      parksLayerRef.current = L.geoJSON(geojson, {
        style: (feature) => ({
          color: "green",
          fillColor: getParkColorByArea(feature?.properties?.area),
          weight: 1,
          fillOpacity: 0.5,
        }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(buildPopupContent(feature as Feature<MultiPolygon, any>));
        },
      }).addTo(mapRef.current);
    }

    if (showHeatmapRef.current && parks.length) {
      const mapSize = mapRef.current.getSize();
      const zoom = mapRef.current.getZoom();

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

      // Use the already tag-filtered parks so the heatmap stays in sync with
      // the active filter. spawnHeatmapWorker keeps the old overlay alive until
      // the new image is ready (no flash).
      spawnHeatmapWorker({
        parks: parks.map((p) => ({
          outerRings: p.polygons.map((poly) => poly[0]),
          area: p.area,
          boundingBox: p.boundingBox,
          id: p.id,
        })),
        mapSize: { x: mapSize.x, y: mapSize.y },
        coordGrid, coordStep,
        bounds: { north: viewNorth, south: viewSouth, east: viewEast, west: viewWest },
        heatmapExtraFactor: HEATMAP_EXTRA_FACTOR,
        areaPow: heatmapParamsRef.current.areaPow,
        sigma: heatmapParamsRef.current.sigma,
        maxScore: heatmapParamsRef.current.maxScore,
      });
    } else if (!showHeatmapRef.current && heatmapOverlayRef.current) {
      workerRef.current?.terminate();
      workerRef.current = null;
      mapRef.current.removeLayer(heatmapOverlayRef.current);
      heatmapOverlayRef.current = null;
      scoreGridSnapshotRef.current = null;
      heatmapDataUrlRef.current = null;
      // Reset the generation counter so any late-arriving worker message is discarded.
      heatmapGenRef.current++;
    }
  }

  // ─── Entry points ─────────────────────────────────────────────────────────────

  function redrawParks() {
    if (!mapRef.current) return;
    const bounds = getExpandedBounds();
    const parks = getBoundedParkData(bounds.north, bounds.east, bounds.south, bounds.west, activeTagsRef.current);
    paintLayers(parks, bounds);
  }

  redrawParksRef.current = redrawParks;

  async function fetchAndLoad() {
    if (!mapRef.current) return;
    const bounds = getExpandedBounds();
    try {
      await updateParkData([bounds.north, bounds.east, bounds.south, bounds.west]);
      onTagsAvailableRef.current(getAvailableTags());
      const parks = getBoundedParkData(bounds.north, bounds.east, bounds.south, bounds.west, activeTagsRef.current);
      paintLayers(parks, bounds);
    } catch (error) {
      console.error("Error loading parks:", error);
    }
  }

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw" }}>
      <div id="map" style={{ height: "100%", width: "100%", margin: 0, padding: 0, zIndex: 0 }} />
    </div>
  );
});

export default Map;