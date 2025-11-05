import React, { Suspense, useState } from "react";
import { forceReload } from "../../backend/mapData/mapData";
import toast, { Toaster } from "react-hot-toast";

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
                border: isActive ? "2px solid #71009a" : "2px solid #a5a1a1",
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
    return (
        <div style={styles.page}>
            <Toaster position="top-center" reverseOrder={false} />
            <Suspense fallback={<div>Loading map...</div>}>
                <Map showHeatmap={isHeatmapEnabled} showParks={isParkLayerEnabled} />
            </Suspense>

            <div style={styles.buttons}>
                <div
                    style={styles.resetButton}
                    onClick={() => {
                        forceReload();
                        console.log("MEOW!");
                    }}
                >
                    <img
                        src={"/assets/icons/redo.svg"}
                        style={{ height: "1.5rem", width: "1.5rem" }}
                    />
                </div>
                <LayerButton
                    isEnabled={isHeatmapEnabled}
                    toggle={(newState: boolean) => {
                        toggleHeatmap(newState);
                        console.log("HeatMap:", newState);
                    }}
                    normalLink={"/assets/icons/map-white.svg"}
                    activeLink={"/assets/icons/map-color.svg"}
                />
                <LayerButton
                    isEnabled={isParkLayerEnabled}
                    toggle={(newState: boolean) => {
                        toggleParkLayer(newState);
                    }}
                    normalLink={"/assets/icons/park-white.svg"}
                    activeLink={"/assets/icons/park-color.svg"}
                />
            </div>
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
};
