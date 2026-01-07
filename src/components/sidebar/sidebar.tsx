import React, { Suspense, useEffect, useState } from "react";
import SettingsSVG from "../dynamicSVGs/settingsSVG";
import CloseSVG from "../dynamicSVGs/closeSVG";

const ToggleButton = ({
  text,
  base_enabled,
  onChanged,
  base_expanded,
  onExpanded,
}: {
  text: string;
  base_enabled: boolean;
  onChanged: Function;
  base_expanded: boolean;
  onExpanded: Function;
}) => {
  const [enabled, setEnabled] = useState(base_enabled);
  useEffect(() => {
    setEnabled(base_enabled);
  }, [base_enabled]);
  const [expanded, setExpanded] = useState(base_expanded);
  useEffect(() => {
    setExpanded(base_expanded);
  }, [base_expanded]);
  return (
    <div style={styles.toggleSection}>
      <label
        style={{
          ...styles.label,
          color: !enabled ? "var(--text-disabled)" : "var(--text-normal)",
        }}
      >
        {text}
      </label>
      <div style={styles.toggleSubRow}>
        <button
          style={{
            ...styles.toggleButton,
            color: !enabled ? "var(--green)" : "var(--red)",
            background: !enabled ? "var(--green-background)" : "var(--red-background)",
          }}
          onClick={() => {
            setEnabled((prev) => {
              onChanged(!prev);
              return !prev;
            });
          }}
        >
          {enabled ? "Disable" : "Enable"}
        </button>
        {!expanded ? (
          <SettingsSVG
            color={!enabled ? "var(--text-disabled)" : "var(--text-normal)"}
            hoverColor={"var(--text-heading)"}
            styles={styles.smallIcon}
            onClick={() => {
              onExpanded(true);
              setExpanded(true);
            }}
          />
        ) : (
          <CloseSVG
            color={!enabled ? "var(--text-disabled)" : "var(--text-normal)"}
            hoverColor={"var(--text-heading)"}
            styles={styles.smallIcon}
            onClick={() => {
              onExpanded(false);
              setExpanded(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

const Sidebar = ({
  onClose,
  showParks,
  showHeatmap,
  onSetParks,
  onSetHeatmap,
}: {
  onClose: Function;
  showParks: boolean;
  showHeatmap: boolean;
  onSetParks: Function;
  onSetHeatmap: Function;
}) => {
  const [parksEnabled, setParksEnabled] = useState(showParks);
  const [heatmapEnabled, setHeatmapEnabled] = useState(showHeatmap);
  useEffect(() => {
    setParksEnabled(showParks);
    setHeatmapEnabled(showHeatmap);
  }, [showParks, showHeatmap]);

  const [isParksDropdownOpen, setIsParksDropdownOpen] = useState(false);
  const [isHeatmapDropdownOpen, setIsHeatmapDropdownOpen] = useState(false);

  return (
    <div style={styles.container}>
      <div style={styles.closeButtonContainer}>
        <p style={styles.heading}>Customize your map!</p>
        <img
          src="/assets/icons/close.svg"
          style={styles.closeButton}
          onClick={() => {
            onClose();
          }}
        />
      </div>

      <ToggleButton
        text="Parks"
        base_enabled={parksEnabled}
        onChanged={onSetParks}
        base_expanded={isParksDropdownOpen}
        onExpanded={() => {
          setIsParksDropdownOpen((prev) => !prev);
        }}
      />
      {isParksDropdownOpen && (
        <div style={{ color: "var(--text-disabled)", paddingLeft: "20px", fontSize: "15px" }}>
          what are you looking for? :D
        </div>
      )}
      <ToggleButton
        text="Heatmap"
        base_enabled={heatmapEnabled}
        onChanged={onSetHeatmap}
        base_expanded={isHeatmapDropdownOpen}
        onExpanded={() => {
          setIsHeatmapDropdownOpen((prev) => !prev);
        }}
      />
      {isHeatmapDropdownOpen && (
        <div style={{ color: "var(--text-disabled)", paddingLeft: "20px", fontSize: "15px" }}>
          nothing's here, come back later
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={styles.buttonGroup}>
        <button
          style={styles.resetDefaultButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--red)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--red-background)";
          }}
          onClick={() => {
            setParksEnabled(true);
            onSetParks(true);
            setHeatmapEnabled(true);
            onSetHeatmap(true);
          }}
        >
          Reset Default
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: "0",
    left: "0",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    minWidth: "min(400px, 25vw)",
    boxSizing: "border-box",
    gap: "1rem",
    background: "var(--background)",
    padding: "1rem 1rem",
    borderBottomRightRadius: "15px",
    zIndex: "100",
  },
  closeButton: {
    width: "2rem",
    height: "2rem",
    background: "var(--background)",
    borderRadius: "10px",
    cursor: "pointer",
  },
  closeButtonContainer: {
    height: "2rem",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  heading: {
    fontSize: "1.35rem",
    color: "var(--text-heading)",
    fontWeight: "bold",
    textShadow: "0 0 6px var(--text-shadow)",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  label: {
    fontSize: "1rem",
    color: "var(--text-normal)",
  },
  slider: {
    width: "100%",
    height: "8px",
    borderRadius: "4px",
    background: "linear-gradient(90deg, #e9d5ff 0%, #9400ca 100%)",
    outline: "none",
    cursor: "pointer",
    WebkitAppearance: "none",
  },
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "1rem",
  },
  resetDefaultButton: {
    padding: "0.75rem 1rem",
    fontSize: "1rem",
    fontWeight: "600",
    border: "2px solid var(--red-background)",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    color: "var(--red)",
    background: "var(--red-background)",
  },
  toggleSection: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0",
  },
  toggleButton: {
    padding: "0.3rem 0.5rem",
    borderRadius: "5px",
    transition: "all 0.3s ease",
    border: "none",
    fontWeight: "bold",
    width: "4.5rem",
    cursor: "pointer",
  },
  smallIcon: {
    width: "1.5rem",
    height: "1.5rem",
    cursor: "pointer",
  },
  toggleSubRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "0.5rem",
  },
};

export default Sidebar;
