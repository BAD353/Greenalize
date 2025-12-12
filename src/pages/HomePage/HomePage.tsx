import React, { Suspense, useState } from "react";
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
    return (
        <div
            style={{
                ...styles.button,
                border: isActive
                    ? "2px solid var(--button-enabled)"
                    : "2px solid var(--button-disabled)",
            }}
            onClick={() => {
                toggle(!isActive);
                setActive(!isActive);
            }}
        >
            <img
                src={isActive ? activeLink : normalLink}
                style={{ height: "1.5rem", width: "1.5rem" }}
            />
        </div>
    );
};

export default function HomePage() {
    const [isHeatmapEnabled, toggleHeatmap] = useState(true);
    const [isParkLayerEnabled, toggleParkLayer] = useState(true);
    const [isMenuOpen, toggleMenu] = useState(false);
    return (
        <div style={styles.page}>
            <Suspense fallback={<div>Loading map...</div>}>
                <Map showHeatmap={isHeatmapEnabled} showParks={isParkLayerEnabled} />
            </Suspense>

            <div style={styles.buttons}>
                <div
                    style={styles.resetButton}
                    onClick={() => {
                        forceReload();
                    }}
                >
                    <img
                        src={"/assets/icons/redo.svg"}
                        style={{ height: "1.5rem", width: "1.5rem" }}
                    />
                </div>

                <LayerButton
                    isEnabled={isParkLayerEnabled}
                    toggle={(newState: boolean) => {
                        toggleParkLayer(newState);
                    }}
                    normalLink={"/assets/icons/park-white.svg"}
                    activeLink={"/assets/icons/park-color.svg"}
                />
                <LayerButton
                    isEnabled={isHeatmapEnabled}
                    toggle={(newState: boolean) => {
                        toggleHeatmap(newState);
                    }}
                    normalLink={"/assets/icons/map-white.svg"}
                    activeLink={"/assets/icons/map-color.svg"}
                />
            </div>
            {isMenuOpen ? (
                <Sidebar
                    onClose={() => {
                        toggleMenu(false);
                    }}
                />
            ) : (
                <div
                    style={styles.menuButtonContainer}
                    onClick={() => {
                        toggleMenu(true);
                    }}
                >
                    <img
                        src={"/assets/icons/menu.svg"}
                        style={{ height: "1.5rem", width: "1.5rem" }}
                    />
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
        fontFamily: "Roboto, sans-serif",
    },
    buttons: {
        position: "absolute",
        top: "1rem",
        right: "1rem",
        display: "flex",
        gap: "1rem",
        border: "2px solid #ccc",
        background: "#fff",
        padding: "0.5rem 1rem",
        borderRadius: "10px",
        zIndex: "100",
    },
    button: {
        borderRadius: "5px",
        border: "1px solid #ccc",
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
        top: "1rem",
        left: "1rem",
        display: "flex",
        gap: "1rem",
        border: "2px solid var(--button-enabled)",
        background: "#fff",
        padding: "0.5rem 0.5rem",
        borderRadius: "10px",
        cursor: "pointer",
        zIndex: "100",
    },
};
