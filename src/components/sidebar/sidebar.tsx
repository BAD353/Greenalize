import React, { useEffect, useState } from "react";
import SettingsSVG from "../dynamicSVGs/settingsSVG";
import CloseSVG from "../dynamicSVGs/closeSVG";
import type { DeletedPark } from "../../backend/mapData/deletedParks";

// ─── Toggle Button ────────────────────────────────────────────────────────────

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
  useEffect(() => { setEnabled(base_enabled); }, [base_enabled]);

  const [expanded, setExpanded] = useState(base_expanded);
  useEffect(() => { setExpanded(base_expanded); }, [base_expanded]);

  return (
    <div style={styles.toggleSection}>
      <label style={{ ...styles.label, color: enabled ? "var(--text-normal)" : "var(--text-disabled)" }}>
        {text}
      </label>
      <div style={styles.toggleSubRow}>
        <button
          style={{
            ...styles.toggleButton,
            color: enabled ? "var(--red)" : "var(--green)",
            background: enabled ? "var(--red-background)" : "var(--green-background)",
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
        {expanded ? (
          <CloseSVG
            color={enabled ? "var(--text-normal)" : "var(--text-disabled)"}
            hoverColor="var(--text-heading)"
            styles={styles.smallIcon}
            onClick={() => { onExpanded(false); setExpanded(false); }}
          />
        ) : (
          <SettingsSVG
            color={enabled ? "var(--text-normal)" : "var(--text-disabled)"}
            hoverColor="var(--text-heading)"
            styles={styles.smallIcon}
            onClick={() => { onExpanded(true); setExpanded(true); }}
          />
        )}
      </div>
    </div>
  );
};

// ─── Tag Chip ─────────────────────────────────────────────────────────────────

const TagChip = ({ label }: { label: string }) => (
  <span style={styles.tagChip}>{label}</span>
);

// ─── Deleted Park Row ─────────────────────────────────────────────────────────

const DeletedParkRow = ({
  park,
  onRestore,
}: {
  park: DeletedPark;
  onRestore: () => void;
}) => {
  const hasName = park.name && !park.name.startsWith("Park ");

  return (
    <li style={styles.deletedItem}>
      <div style={styles.deletedItemPrimary}>
        <span style={styles.deletedItemTitle}>
          {hasName ? park.name : `ID: ${park.id}`}
        </span>
        <button style={styles.restoreButton} onClick={onRestore}>
          Restore
        </button>
      </div>

      <span style={styles.deletedItemMeta}>
        {hasName ? `ID: ${park.id}` : ""}
        {hasName && park.area > 0 ? ", " : ""}
        {park.area > 0 ? `${Math.round(park.area)} m²` : ""}
      </span>

      {park.tags?.length > 0 && (
        <div style={styles.tagRow}>
          {park.tags.map((tag) => <TagChip key={tag} label={tag} />)}
        </div>
      )}
    </li>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = "filters" | "deleted";

const Sidebar = ({
  onClose,
  showParks,
  showHeatmap,
  onSetParks,
  onSetHeatmap,
  deletedParks,
  onRestorePark,
  onClearDeleted,
}: {
  onClose: Function;
  showParks: boolean;
  showHeatmap: boolean;
  onSetParks: Function;
  onSetHeatmap: Function;
  deletedParks: DeletedPark[];
  onRestorePark: (id: number) => void;
  onClearDeleted: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("filters");
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
      {/* Header */}
      <div style={styles.header}>
        <p style={styles.heading}>Customize your map!</p>
        <img
          src="/assets/icons/close.svg"
          style={styles.closeButton}
          onClick={() => onClose()}
        />
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button
          style={{ ...styles.tab, ...(activeTab === "filters" ? styles.tabActive : styles.tabInactive) }}
          onClick={() => setActiveTab("filters")}
        >
          Filters
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === "deleted" ? styles.tabActive : styles.tabInactive) }}
          onClick={() => setActiveTab("deleted")}
        >
          Deleted Parks
          {deletedParks.length > 0 && (
            <span style={styles.tabBadge}>{deletedParks.length}</span>
          )}
        </button>
      </div>

      {/* Tab divider */}
      <div style={styles.tabDivider} />

      {/* ── Filters tab ── */}
      {activeTab === "filters" && (
        <div style={styles.tabContent}>
          <p style={styles.sectionLabel}>Layers</p>

          <ToggleButton
            text="Parks"
            base_enabled={parksEnabled}
            onChanged={onSetParks}
            base_expanded={isParksDropdownOpen}
            onExpanded={() => setIsParksDropdownOpen((prev) => !prev)}
          />
          {isParksDropdownOpen && (
            <div style={styles.dropdownPlaceholder}>what are you looking for? :D</div>
          )}

          <ToggleButton
            text="Heatmap"
            base_enabled={heatmapEnabled}
            onChanged={onSetHeatmap}
            base_expanded={isHeatmapDropdownOpen}
            onExpanded={() => setIsHeatmapDropdownOpen((prev) => !prev)}
          />
          {isHeatmapDropdownOpen && (
            <div style={styles.dropdownPlaceholder}>nothing's here, come back later</div>
          )}

          <div style={{ flex: 1 }} />

          <button
            style={styles.resetDefaultButton}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--red)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--red-background)"; }}
            onClick={() => {
              setParksEnabled(true);
              onSetParks(true);
              setHeatmapEnabled(true);
              onSetHeatmap(true);
              onClearDeleted();
            }}
          >
            Reset Default
          </button>
        </div>
      )}

      {/* ── Deleted parks tab ── */}
      {activeTab === "deleted" && (
        <div style={styles.tabContent}>
          {deletedParks.length === 0 ? (
            <p style={styles.emptyState}>No parks deleted yet.</p>
          ) : (
            <ul style={styles.deletedList}>
              {deletedParks.map((park, i) => (
                <React.Fragment key={park.id}>
                  <DeletedParkRow
                    park={park}
                    onRestore={() => onRestorePark(park.id)}
                  />
                  {/* Divider between rows, not after the last one */}
                  {i < deletedParks.length - 1 && <div style={styles.rowDivider} />}
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    background: "var(--background)",
    borderRight: "3px solid var(--button-border-green)",
    borderBottom: "3px solid var(--button-border-green)",
    padding: "1rem",
    paddingBottom: "1.5rem",
    borderBottomRightRadius: "15px",
    zIndex: "100",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1.25rem",
  },
  heading: {
    fontSize: "1.35rem",
    color: "var(--text-heading)",
    fontWeight: "bold",
    textShadow: "0 0 6px var(--text-shadow)",
    margin: 0,
  },
  closeButton: {
    width: "2rem",
    height: "2rem",
    borderRadius: "10px",
    cursor: "pointer",
  },

  // Tab bar
  tabBar: {
    display: "flex",
    flexDirection: "row",
    gap: "0",
  },
  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "0.5rem 0",
    fontSize: "0.95rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    background: "none",
    transition: "color 0.15s ease",
  },
  tabActive: {
    color: "var(--text-heading)",
    borderBottom: "2px solid var(--button-border-green)",
  },
  tabInactive: {
    color: "var(--text-disabled)",
    borderBottom: "2px solid transparent",
  },
  tabBadge: {
    background: "var(--red-background)",
    color: "var(--red)",
    borderRadius: "999px",
    fontSize: "0.7rem",
    fontWeight: "bold",
    padding: "1px 6px",
  },
  tabDivider: {
    height: "1px",
    background: "var(--button-border-green)",
    margin: "0 0 1rem 0",
  },

  // Tab content wrapper
  tabContent: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    gap: "0.5rem",
    overflowY: "auto",
  },
  sectionLabel: {
    fontSize: "0.78rem",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-normal)",
    margin: "0 0 0.25rem 0",
  },
  dropdownPlaceholder: {
    color: "var(--text-disabled)",
    paddingLeft: "20px",
    fontSize: "15px",
  },
  emptyState: {
    color: "var(--text-disabled)",
    fontSize: "0.9rem",
    textAlign: "center",
    marginTop: "2rem",
  },

  // Deleted parks list
  deletedList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
  },
  deletedItem: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    padding: "0.6rem 0.25rem",
    background: "transparent",
  },
  rowDivider: {
    height: "1px",
    background: "var(--button-border-green)",
    opacity: 0.5,
  },
  deletedItemPrimary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  deletedItemTitle: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "var(--text-normal)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Darker than before - using text-normal at reduced opacity rather than text-disabled
  deletedItemMeta: {
    fontSize: "0.78rem",
    color: "var(--text-normal)",
    opacity: 0.6,
  },
  restoreButton: {
    padding: "0.2rem 0.6rem",
    borderRadius: "5px",
    border: "none",
    background: "var(--green-background)",
    color: "var(--green)",
    fontWeight: "bold",
    fontSize: "0.8rem",
    cursor: "pointer",
    flexShrink: 0,
  },
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    marginTop: "2px",
  },
  tagChip: {
    background: "var(--green-background)",
    color: "var(--green)",
    borderRadius: "999px",
    fontSize: "0.72rem",
    fontWeight: "bold",
    padding: "2px 8px",
  },

  // Filters tab
  label: {
    fontSize: "1rem",
    fontWeight: "500",
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
  toggleSubRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "0.5rem",
  },
  smallIcon: {
    width: "1.5rem",
    height: "1.5rem",
    cursor: "pointer",
  },
  resetDefaultButton: {
    marginTop: "auto",
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
};

export default Sidebar;