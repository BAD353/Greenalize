import React, { useEffect, useState } from "react";
import SettingsSVG from "../dynamicSVGs/settingsSVG";
import CloseSVG from "../dynamicSVGs/closeSVG";
import type { DeletedPark } from "../../backend/mapData/deletedParks";
import type { HeatmapParams } from "../Map/Map";
import { DEFAULT_HEATMAP_PARAMS } from "../Map/Map";
import OverpassServerPicker from "../OverpassServerPicker/OverpassServerPicker";
import { TAG_GROUPS, DEFAULT_SELECTED_TAGS, type TagGroup } from "../../utils/tagGroups";

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

// ─── Slider Row ───────────────────────────────────────────────────────────────

const SliderRow = ({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) => (
  <div style={{ ...styles.sliderRow, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
    <div style={styles.sliderHeader}>
      <span style={styles.sliderLabel}>{label}</span>
      <span style={styles.sliderValue}>{display(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={styles.slider}
    />
    <span style={styles.sliderHint}>{hint}</span>
  </div>
);

// ─── Heatmap Options Panel ────────────────────────────────────────────────────

const METERS_PER_DEGREE = 111000;
const MIN_HALF_DISTANCE_M = 20;
const MAX_HALF_DISTANCE_M = 500;
const MIN_SIZE_INFLUENCE = 0;
const MAX_SIZE_INFLUENCE = 1.0;
const MIN_SATURATION_SCORE = 1;
const MAX_SATURATION_SCORE = 10000;

// Sensitivity is logarithmic: every step multiplies the score needed for full green by the same factor
const sensitivityToScore = (percent: number) =>
  MAX_SATURATION_SCORE * Math.pow(MIN_SATURATION_SCORE / MAX_SATURATION_SCORE, percent / 100);
const scoreToSensitivity = (score: number) =>
  Math.round((100 * Math.log(score / MAX_SATURATION_SCORE)) / Math.log(MIN_SATURATION_SCORE / MAX_SATURATION_SCORE));

const formatDistance = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;

const AutoSensitivityRow = ({
  params,
  onChanged,
}: {
  params: HeatmapParams;
  onChanged: (p: HeatmapParams) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const color = params.autoSensitivity ? "var(--text-normal)" : "var(--text-disabled)";

  return (
    <div style={styles.tagGroup}>
      <div style={styles.tagGroupHeader}>
        <label style={styles.tagCheckRow}>
          <input
            type="checkbox"
            checked={params.autoSensitivity}
            onChange={() => onChanged({ ...params, autoSensitivity: !params.autoSensitivity })}
            style={styles.tagCheckbox}
          />
          <div style={styles.tagGroupText}>
            <span style={styles.sliderLabel}>Auto-adjust sensitivity</span>
            <span style={styles.sliderHint}>Balances the colours so the current view always has both green and red areas</span>
          </div>
        </label>
        {expanded ? (
          <CloseSVG
            color={color}
            hoverColor="var(--text-heading)"
            styles={styles.smallIcon}
            onClick={() => setExpanded(false)}
          />
        ) : (
          <SettingsSVG
            color={color}
            hoverColor="var(--text-heading)"
            styles={styles.smallIcon}
            onClick={() => setExpanded(true)}
          />
        )}
      </div>
      {expanded && (
        <SliderRow
          label="Green coverage"
          hint="How much of the map should turn fully green, lower means greener areas stand out more"
          value={Math.round(params.autoGreenShare * 100)}
          min={1}
          max={50}
          step={1}
          display={(v) => `${v}%`}
          onChange={(v) => onChanged({ ...params, autoGreenShare: v / 100 })}
          disabled={!params.autoSensitivity}
        />
      )}
    </div>
  );
};

const HeatmapOptionsPanel = ({
  params = DEFAULT_HEATMAP_PARAMS,
  onChanged,
}: {
  params?: HeatmapParams;
  onChanged: (p: HeatmapParams) => void;
}) => (
  <div style={styles.heatmapPanel}>
    <SliderRow
      label="Base half-influence distance"
      hint="Distance at which an average park's influence drops to half. Bigger and greener parks reach further, smaller ones less"
      value={Math.round(params.halfDistance * METERS_PER_DEGREE)}
      min={MIN_HALF_DISTANCE_M}
      max={MAX_HALF_DISTANCE_M}
      step={10}
      display={formatDistance}
      onChange={(v) => onChanged({ ...params, halfDistance: v / METERS_PER_DEGREE })}
    />
    <SliderRow
      label="Park size importance"
      hint="0% treats every park equally, 100% makes bigger parks count proportionally more"
      value={params.areaPow}
      min={MIN_SIZE_INFLUENCE}
      max={MAX_SIZE_INFLUENCE}
      step={0.05}
      display={(v) => `${Math.round(((v - MIN_SIZE_INFLUENCE) / (MAX_SIZE_INFLUENCE - MIN_SIZE_INFLUENCE)) * 100)}%`}
      onChange={(v) => onChanged({ ...params, areaPow: v })}
    />
    <SliderRow
      label="Sensitivity"
      hint="Low needs lots of parks nearby to turn green, high turns green almost anywhere near a park"
      value={scoreToSensitivity(params.maxScore)}
      min={0}
      max={100}
      step={1}
      display={(v) => `${v}%`}
      onChange={(v) => onChanged({ ...params, maxScore: sensitivityToScore(v) })}
      disabled={params.autoSensitivity}
    />
    <AutoSensitivityRow params={params} onChanged={onChanged} />
  </div>
);
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

// ─── Tag Group Row ────────────────────────────────────────────────────────────

const TagGroupRow = ({
  group,
  availableTags,
  selectedTags,
  onTagsChanged,
}: {
  group: TagGroup;
  availableTags: string[];
  selectedTags: string[];
  onTagsChanged: (tags: string[]) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const groupTags = group.tags.map((t) => t.tag);
  const enabledCount = groupTags.filter((t) => selectedTags.includes(t)).length;
  const allEnabled = enabledCount === groupTags.length;
  const color = enabledCount > 0 ? "var(--text-normal)" : "var(--text-disabled)";

  const toggleGroup = () => {
    const rest = selectedTags.filter((t) => !groupTags.includes(t));
    onTagsChanged(allEnabled ? rest : [...rest, ...groupTags]);
  };

  const toggleTag = (tag: string) => {
    onTagsChanged(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]);
  };

  return (
    <div style={styles.tagGroup}>
      <div style={styles.tagGroupHeader}>
        <label style={styles.tagCheckRow}>
          <input
            type="checkbox"
            checked={allEnabled}
            ref={(el) => { if (el) el.indeterminate = enabledCount > 0 && !allEnabled; }}
            onChange={toggleGroup}
            style={styles.tagCheckbox}
          />
          <div style={styles.tagGroupText}>
            <span style={{ ...styles.tagGroupName, color }}>{group.name}</span>
            <span style={styles.sliderHint}>{group.description}</span>
          </div>
        </label>
        <div style={styles.toggleSubRow}>
          {groupTags.length > 1 && (
            <span style={{ ...styles.tagGroupCount, color }}>{enabledCount}/{groupTags.length}</span>
          )}
          {groupTags.length > 1 && (expanded ? (
            <CloseSVG
              color={color}
              hoverColor="var(--text-heading)"
              styles={styles.smallIcon}
              onClick={() => setExpanded(false)}
            />
          ) : (
            <SettingsSVG
              color={color}
              hoverColor="var(--text-heading)"
              styles={styles.smallIcon}
              onClick={() => setExpanded(true)}
            />
          ))}
        </div>
      </div>
      {expanded && (
        <div style={styles.tagGroupItems}>
          {group.tags.map(({ tag, label }) => {
            const checked = selectedTags.includes(tag);
            return (
              <label key={tag} style={styles.tagCheckRow}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTag(tag)}
                  style={styles.tagCheckbox}
                />
                <span
                  title={availableTags.includes(tag) ? undefined : "None found in the loaded area"}
                  style={{
                    ...styles.tagChipInline,
                    background: checked ? "var(--green-background)" : "transparent",
                    color: checked ? "var(--green)" : "var(--text-disabled)",
                    border: `1.5px solid ${checked ? "var(--green)" : "var(--text-disabled)"}`,
                    opacity: availableTags.includes(tag) ? 1 : 0.5,
                  }}
                >
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Tag Filter Panel ─────────────────────────────────────────────────────────

const TagFilterPanel = ({
  availableTags,
  selectedTags,
  onTagsChanged,
}: {
  availableTags: string[];
  selectedTags: string[];
  onTagsChanged: (tags: string[]) => void;
}) => (
  <div style={styles.tagFilterSection}>
    <div style={styles.tagFilterHeader}>
      <span style={styles.tagFilterLabel}>Filter by type</span>
      <div style={styles.toggleSubRow}>
        <button style={styles.tagClearButton} onClick={() => onTagsChanged(DEFAULT_SELECTED_TAGS)}>
          Defaults
        </button>
        {selectedTags.length > 0 && (
          <button style={styles.tagClearButton} onClick={() => onTagsChanged([])}>
            Clear all
          </button>
        )}
      </div>
    </div>
    {TAG_GROUPS.map((group) => (
      <TagGroupRow
        key={group.id}
        group={group}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagsChanged={onTagsChanged}
      />
    ))}
  </div>
);
// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = "filters" | "deleted";

const Sidebar = ({
  onClose,
  onBack,
  showParks,
  showHeatmap,
  onSetParks,
  onSetHeatmap,
  deletedParks,
  onRestorePark,
  onClearDeleted,
  availableTags,
  selectedTags,
  onTagsChanged,
  heatmapParams = DEFAULT_HEATMAP_PARAMS,
  onHeatmapParamsChanged,
  preloadedCityName,
  onLeavePreloaded,
}: {
  onClose: Function;
  onBack: () => void;
  showParks: boolean;
  showHeatmap: boolean;
  onSetParks: Function;
  onSetHeatmap: Function;
  deletedParks: DeletedPark[];
  onRestorePark: (id: number) => void;
  onClearDeleted: () => void;
  availableTags: string[];
  selectedTags: string[];
  onTagsChanged: (tags: string[]) => void;
  heatmapParams?: HeatmapParams;
  onHeatmapParamsChanged: (p: HeatmapParams) => void;
  preloadedCityName?: string;
  onLeavePreloaded?: () => void;
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
        <button style={styles.homeButton} onClick={() => onBack()} title="Leave the map and go to the home page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.homeIcon}>
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10" />
          </svg>
          Home
        </button>
        <img
          src="/assets/icons/close.svg"
          alt="Close menu"
          style={styles.closeButton}
          onClick={() => onClose()}
        />
      </div>
      <p style={styles.heading}>Customize your map!</p>

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
            <TagFilterPanel
              availableTags={availableTags}
              selectedTags={selectedTags}
              onTagsChanged={onTagsChanged}
            />
          )}

          <ToggleButton
            text="Heatmap"
            base_enabled={heatmapEnabled}
            onChanged={onSetHeatmap}
            base_expanded={isHeatmapDropdownOpen}
            onExpanded={() => setIsHeatmapDropdownOpen((prev) => !prev)}
          />
          {isHeatmapDropdownOpen && (
            <HeatmapOptionsPanel
              params={heatmapParams}
              onChanged={onHeatmapParamsChanged}
            />
          )}

          <p style={{ ...styles.sectionLabel, marginTop: "1rem" }}>Data source</p>
          {preloadedCityName ? (
            <>
              <span style={{ ...styles.sliderHint, color: "var(--text-normal)" }}>
                Showing the preloaded area of {preloadedCityName}. Nothing is downloaded and the map cannot be moved
                outside it.
              </span>
              <button style={styles.restoreButton} onClick={onLeavePreloaded}>
                Open the full map (downloads more data)
              </button>
            </>
          ) : (
            <OverpassServerPicker />
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
              onTagsChanged([]);
              onClearDeleted();
              onHeatmapParamsChanged(DEFAULT_HEATMAP_PARAMS);
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
    width: "min(390px, 90vw)",
    overflowX: "clip",
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
  homeButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.7rem 0.3rem 0.5rem",
    borderRadius: "8px",
    border: "2px solid var(--button-border-green)",
    background: "var(--green-background)",
    color: "var(--text-heading)",
    fontFamily: "inherit",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  homeIcon: {
    width: "1.25rem",
    height: "1.25rem",
  },
  heading: {
    fontSize: "1.2rem",
    color: "var(--text-heading)",
    fontWeight: "bold",
    textShadow: "0 0 6px var(--text-shadow)",
    margin: "0 0 1rem 0",
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
    overflowX: "clip",
  },
  sectionLabel: {
    fontSize: "0.78rem",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-normal)",
    margin: "0 0 0.25rem 0",
  },
  emptyState: {
    color: "var(--text-disabled)",
    fontSize: "0.9rem",
    textAlign: "center",
    marginTop: "2rem",
  },

  // Heatmap options panel
  heatmapPanel: {
    paddingLeft: "0.75rem",
    paddingBottom: "0.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  sliderRow: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  sliderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sliderLabel: {
    fontSize: "0.85rem",
    fontWeight: "600",
    color: "var(--text-normal)",
  },
  sliderValue: {
    fontSize: "0.78rem",
    fontWeight: "600",
    color: "var(--green)",
    minWidth: "6rem",
    textAlign: "right",
  },
  slider: {
    width: "100%",
    margin: 0,
    accentColor: "var(--green)",
    cursor: "pointer",
  },
  sliderHint: {
    fontSize: "0.72rem",
    color: "var(--text-disabled)",
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
    flexShrink: 0,
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

  // Tag filter panel
  tagFilterSection: {
    paddingLeft: "0.75rem",
    paddingBottom: "0.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  tagFilterHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.1rem",
  },
  tagFilterLabel: {
    fontSize: "0.75rem",
    fontWeight: "700",
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "var(--text-normal)",
  },
  tagClearButton: {
    background: "none",
    border: "none",
    color: "var(--text-disabled)",
    fontSize: "0.75rem",
    cursor: "pointer",
    padding: "0 2px",
    textDecoration: "underline",
  },
  tagCheckRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    cursor: "pointer",
  },
  tagGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  tagGroupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  tagGroupText: {
    display: "flex",
    flexDirection: "column",
  },
  tagGroupName: {
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  tagGroupCount: {
    fontSize: "0.78rem",
    fontWeight: "600",
  },
  tagGroupItems: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    paddingLeft: "1.5rem",
    paddingBottom: "0.25rem",
  },
  tagCheckbox: {
    accentColor: "var(--green)",
    width: "1rem",
    height: "1rem",
    cursor: "pointer",
    flexShrink: 0,
  },
  tagChipInline: {
    borderRadius: "999px",
    fontSize: "0.78rem",
    fontWeight: "600",
    padding: "2px 10px",
    transition: "all 0.15s ease",
  },
};

export default Sidebar;