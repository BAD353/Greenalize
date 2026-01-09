import React, { Suspense, useEffect, useState } from "react";
import { forceReload } from "../../backend/mapData/mapData";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../../components/sidebar/sidebar";

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
  return (
    <div style={styles.page}>
      <Suspense fallback={<div>Loading map...</div>}>
        <Map showHeatmap={isHeatmapLayerEnabled} showParks={isParkLayerEnabled} />
      </Suspense>

      <div style={styles.buttons}>
        <div
          style={styles.resetButton}
          onClick={() => {
            forceReload();
          }}
        >
          <img src={"/assets/icons/redo.svg"} style={{ height: "1.5rem", width: "1.5rem" }} />
        </div>

        <LayerButton
          isEnabled={isParkLayerEnabled}
          toggle={(newState: boolean) => {
            setParkLayer(newState);
          }}
          normalLink={"/assets/icons/park-normal.svg"}
          activeLink={"/assets/icons/park-active.svg"}
        />
        <LayerButton
          isEnabled={isHeatmapLayerEnabled}
          toggle={(newState: boolean) => {
            setHeatmapLayer(newState);
          }}
          normalLink={"/assets/icons/map-normal.svg"}
          activeLink={"/assets/icons/map-active.svg"}
        />
      </div>
      {isMenuOpen ? (
        <Sidebar
          onClose={() => {
            toggleMenu(false);
          }}
          showParks={isParkLayerEnabled}
          showHeatmap={isHeatmapLayerEnabled}
          onSetParks={(value) => setParkLayer(value)}
          onSetHeatmap={(value) => setHeatmapLayer(value)}
        />
      ) : (
        <div
          style={styles.menuButtonContainer}
          onClick={() => {
            toggleMenu(true);
          }}
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
