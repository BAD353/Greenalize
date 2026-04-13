import React, { Suspense, useEffect, useRef, useState } from "react";
import { forceReload } from "../../backend/mapData/mapData";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../../components/sidebar/sidebar";
import {
  deletePark,
  getDeletedParks,
  restorePark,
  loadDeletedParks,
  type DeletedPark,
  clearDeletedParks,
} from "../../backend/mapData/deletedParks";
import type { MapHandle } from "../../components/Map/Map";
import { DEFAULT_HEATMAP_PARAMS } from "../../components/Map/Map";
import type { HeatmapParams } from "../../components/Map/Map";
import { useNavigate } from "react-router-dom";

const Map = React.lazy(() => import("../../components/Map/Map"));

const LayerButton = ({
  isEnabled,
  toggle,
  normalLink,
  activeLink,
}: {
  isEnabled: boolean;
  toggle: Function;
  normalLink: string;
  activeLink: string;
}) => {
  const [isActive, setActive] = useState(isEnabled);
  useEffect(() => {
    setActive(isEnabled);
  }, [isEnabled]);
  return (
    <div
      style={{
        ...styles.button,
        border: isActive ? "2px solid var(--button-border-green)" : "2px solid #a5a1a1",
      }}
      onClick={() => {
        setActive(!isActive);
        toggle(!isActive);
      }}
    >
      <img src={isActive ? activeLink : normalLink} style={{ height: "1.5rem", width: "1.5rem" }} />
    </div>
  );
};

export default function HomePage() {
  const [isHeatmapLayerEnabled, setHeatmapLayer] = useState(true);
  const [isParkLayerEnabled, setParkLayer] = useState(true);
  const [isMenuOpen, toggleMenu] = useState(false);
  const [deletedParks, setDeletedParks] = useState<DeletedPark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [heatmapParams, setHeatmapParams] = useState<HeatmapParams>(DEFAULT_HEATMAP_PARAMS);

  const mapRef = useRef<MapHandle>(null);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const navigate = useNavigate();

  const handleDeletePark = async (park) => {
    await deletePark(park);
    setDeletedParks(getDeletedParks());
    setMapRefreshKey((k) => k + 1);
  };

  const handleRestorePark = async (id) => {
    await restorePark(id);
    setDeletedParks(getDeletedParks());
    setMapRefreshKey((k) => k + 1);
  };

  const handleClearDeleted = async () => {
    await clearDeletedParks();
    setDeletedParks([]);
    setMapRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    loadDeletedParks().then(() => setDeletedParks(getDeletedParks()));
  }, []);

  return (
    <div style={styles.page}>
      {/* Loading overlay — shown on first data fetch */}
      {/* {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingCard}>
            <div style={styles.loadingSpinner} />
            <span style={styles.loadingText}>Loading parks…</span>
          </div>
        </div>
      )} */}

      <Suspense fallback={<div>Loading map...</div>}>
        <Map
          ref={mapRef}
          showHeatmap={isHeatmapLayerEnabled}
          showParks={isParkLayerEnabled}
          onDeletePark={handleDeletePark}
          refreshKey={mapRefreshKey}
          activeTags={selectedTags}
          onTagsAvailable={setAvailableTags}
          heatmapParams={heatmapParams}
          onLoading={setIsLoading}
        />
      </Suspense>

      <div style={styles.buttons}>
        {/* Soft reload */}
        <div
          style={styles.resetButton}
          onClick={() => forceReload()}
          title="Reload data"
        >
          <img src={"/assets/icons/redo-2.svg"} style={{ height: "1.5rem", width: "1.5rem" }} />
        </div>

        {/* Export heatmap as PNG */}
        <div
          style={{
            ...styles.resetButton,
            opacity: isHeatmapLayerEnabled ? 1 : 0.35,
            cursor: isHeatmapLayerEnabled ? "pointer" : "not-allowed",
          }}
          onClick={() => isHeatmapLayerEnabled && mapRef.current?.exportPng()}
          title="Export heatmap as PNG"
        >
          <img src={"/assets/icons/download.svg"} style={{ height: "1.5rem", width: "1.5rem" }} />
        </div>

        <LayerButton
          isEnabled={isParkLayerEnabled}
          toggle={(newState: boolean) => setParkLayer(newState)}
          normalLink={"/assets/icons/park-normal.svg"}
          activeLink={"/assets/icons/park-active.svg"}
        />
        <LayerButton
          isEnabled={isHeatmapLayerEnabled}
          toggle={(newState: boolean) => setHeatmapLayer(newState)}
          normalLink={"/assets/icons/map-normal.svg"}
          activeLink={"/assets/icons/map-active.svg"}
        />
      </div>

      {isMenuOpen ? (
        <Sidebar
          onClose={() => toggleMenu(false)}
          onBack={() => navigate("/")}
          showParks={isParkLayerEnabled}
          showHeatmap={isHeatmapLayerEnabled}
          onSetParks={(value) => setParkLayer(value)}
          onSetHeatmap={(value) => setHeatmapLayer(value)}
          deletedParks={deletedParks}
          onRestorePark={handleRestorePark}
          onClearDeleted={handleClearDeleted}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onTagsChanged={setSelectedTags}
          heatmapParams={heatmapParams}
          onHeatmapParamsChanged={setHeatmapParams}
        />
      ) : (
        <div
          style={styles.menuButtonContainer}
          onClick={() => toggleMenu(true)}
        >
          <img src={"/assets/icons/menu.svg"} style={{ height: "1.5rem", width: "1.5rem" }} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    width: "100vw",
    margin: 0,
    position: "relative",
    fontFamily: "Inter, sans-serif",
  },

  // ── Loading overlay ──
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 255, 255, 0.55)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    pointerEvents: "all",
  },
  loadingCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    background: "#ffffff",
    border: "2px solid var(--button-border-green)",
    borderRadius: "16px",
    padding: "2rem 3rem",
    boxShadow: "0 8px 30px rgba(121, 163, 124, 0.2)",
  },
  loadingSpinner: {
    width: "2.5rem",
    height: "2.5rem",
    borderRadius: "50%",
    border: "3px solid rgba(121, 163, 124, 0.2)",
    borderTopColor: "var(--button-border-green, #79a37c)",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "#4b6f54",
    fontSize: "1rem",
    fontWeight: 500,
    letterSpacing: "0.02em",
  },

  // ── Map UI ──
  buttons: {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    display: "flex",
    gap: "1rem",
    background: "var(--background)",
    padding: "0.5rem 1rem",
    borderRadius: "10px",
    zIndex: "100",
    border: "2px solid var(--button-border-green)",
  },
  button: {
    borderRadius: "5px",
    cursor: "pointer",
    height: "2rem",
    width: "2rem",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  resetButton: {
    cursor: "pointer",
    height: "2rem",
    width: "2rem",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  menuButtonContainer: {
    position: "absolute",
    top: "1.5rem",
    left: "1.5rem",

    display: "flex",
    justifyContent: "center",
    alignItems: "center",

    width: "2.5rem",
    height: "2.5rem",

    background: "var(--background)",
    borderRadius: "10px",
    border: "2px solid var(--button-border-green)",

    cursor: "pointer",
    zIndex: "100",
  },
};

// // Inject the spinner keyframe once
// if (typeof document !== "undefined") {
//   const styleId = "home-page-spinner-style";
//   if (!document.getElementById(styleId)) {
//     const s = document.createElement("style");
//     s.id = styleId;
//     s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
//     document.head.appendChild(s);
//   }
// }