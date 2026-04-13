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
  onLoading?: (loading: boolean) => void;
};

interface ScoreGridSnapshot {
  grid: Float32Array;
  gridWidth: number;
  gridHeight: number;
  bounds: { north: number; south: number; east: number; west: number };
  coordStep: number;
}

const Map = forwardRef<MapHandle, MapProps>(
  function Map(
    { showHeatmap, showParks, onDeletePark, refreshKey, activeTags, onTagsAvailable, heatmapParams, onLoading },
    ref
  ) {
  const mapRef = useRef<L.Map | null>(null);
  const parksLayerRef = useRef<L.GeoJSON | null>(null);
  const heatmapOverlayRef = useRef<L.ImageOverlay | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastMoveRef = useRef<number>(performance.now());

  const scoreGridSnapshotRef = useRef<ScoreGridSnapshot | null>(null);
  const greenPopupRef = useRef<L.Popup | null>(null);
  const heatmapGenRef = useRef<number>(0);
  const heatmapDataUrlRef = useRef<string | null>(null);

  // Keep refs in sync so callbacks always read the latest values
  // without triggering map re-initialisation.
  const showParksRef = useRef(showParks);
  const showHeatmapRef = useRef(showHeatmap);
  useEffect(() => {
    showParksRef.current = showParks;
    // Redraw whenever a layer is toggled — do NOT re-init the map.
    if (mapRef.current) redrawParksRef.current();
  }, [showParks]);
  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
    if (mapRef.current) redrawParksRef.current();
  }, [showHeatmap]);

  const activeTagsRef = useRef(activeTags);
  useEffect(() => { activeTagsRef.current = activeTags; }, [activeTags]);

  const heatmapParamsRef = useRef<HeatmapParams>(heatmapParams ?? DEFAULT_HEATMAP_PARAMS);
  useEffect(() => { heatmapParamsRef.current = heatmapParams ?? DEFAULT_HEATMAP_PARAMS; }, [heatmapParams]);

  const onDeleteParkRef = useRef(onDeletePark);
  useEffect(() => { onDeleteParkRef.current = onDeletePark; }, [onDeletePark]);

  const onTagsAvailableRef = useRef(onTagsAvailable);
  useEffect(() => { onTagsAvailableRef.current = onTagsAvailable; }, [onTagsAvailable]);

  const onLoadingRef = useRef(onLoading);
  useEffect(() => { onLoadingRef.current = onLoading; }, [onLoading]);

  const redrawParksRef = useRef<() => void>(() => {});

  // ─── URL sync helper ────────────────────────────────────────────────────────

  function syncUrlToMap() {
    if (!mapRef.current) return;
    const center = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();
    const params = new URLSearchParams(window.location.search);
    params.set("lat", center.lat.toFixed(5));
    params.set("lng", center.lng.toFixed(5));
    params.set("zoom", String(zoom));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }

  // ─── PNG export ─────────────────────────────────────────────────────────────

  async function exportMapPng() {
    if (!mapRef.current) return;

    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    const { width, height } = mapEl.getBoundingClientRect();
    const out = document.createElement("canvas");
    out.width = Math.round(width);
    out.height = Math.round(height);
    const ctx = out.getContext("2d")!;

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
        img.src = tile.src.includes("?") ? tile.src + "&_cors=1" : tile.src + "?_cors=1";
      })));
    }

    const dataUrl = heatmapDataUrlRef.current;
    if (dataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
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

    const center = mapRef.current.getCenter();
    const zoom   = mapRef.current.getZoom();
    const lat    = center.lat.toFixed(4);
    const lng    = center.lng.toFixed(4);

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

  // ─── Map init — runs once only ──────────────────────────────────────────────
  // NOTE: no layer-state variables in the dependency array; layer changes are
  // handled via their own useEffects above so the map is never re-created.

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

    mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
      if (!showHeatmapRef.current) return;
      const snap = scoreGridSnapshotRef.current;
      if (!snap) return;

      const { lat, lng } = e.latlng;
      const score = sampleScoreGrid(snap, lat, lng);
      const MAX_SCORE = 1e2;
      const ratio = Math.pow(Math.min(score / MAX_SCORE, 1), 0.5);
      const pct = Math.round(ratio * 100);
      const label = `${score}`;

      if (greenPopupRef.current) {
        mapRef.current?.closePopup(greenPopupRef.current);
      }
    });

    fetchAndLoad();

    mapRef.current.on("moveend", () => {
      const now = performance.now();
      syncUrlToMap();
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
  }, []); // Empty deps — map init is intentionally side-effect-only

  useEffect(() => {
    if (!mapRef.current) return;
    redrawParksRef.current();
  }, [refreshKey, activeTags, heatmapParams]);

  // ─── Score grid sampling ────────────────────────────────────────────────────

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

  // ─── Greenness popup ────────────────────────────────────────────────────────

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
    const hue = Math.round(pct * 1.2);
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

  // ─── Heatmap worker ─────────────────────────────────────────────────────────

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
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const gen = ++heatmapGenRef.current;

    const worker = createHeatmapWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if (gen !== heatmapGenRef.current) return;
      if (!mapRef.current) return;

      const { imageDataArray, width, height, bounds, scoreGrid, gridWidth, gridHeight, coordStep } = e.data;

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

  // ─── Popup helpers ───────────────────────────────────────────────────────────

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

  // ─── GeoJSON conversion ──────────────────────────────────────────────────────

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
    onLoadingRef.current?.(true);
    const bounds = getExpandedBounds();
    try {
      await updateParkData([bounds.north, bounds.east, bounds.south, bounds.west]);
      onTagsAvailableRef.current(getAvailableTags());
      const parks = getBoundedParkData(bounds.north, bounds.east, bounds.south, bounds.west, activeTagsRef.current);
      paintLayers(parks, bounds);
    } catch (error) {
      console.error("Error loading parks:", error);
    } finally {
      onLoadingRef.current?.(false);
    }
  }

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw" }}>
      <div id="map" style={{ height: "100%", width: "100%", margin: 0, padding: 0, zIndex: 0 }} />
    </div>
  );
});

export default Map;