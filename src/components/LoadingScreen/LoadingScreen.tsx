import React, { useEffect, useState, useSyncExternalStore } from "react";
import { describeDownload, getLoadProgress, subscribeLoadProgress, TOTAL_STEPS } from "../../backend/mapData/loadProgress";
import ProgressBar from "../LoadingPopup/ProgressBar";

const HINT_INTERVAL_MS = 7000;
const NARROW_BREAKPOINT = 900;

type Hint = { label: "Did you know" | "Tip"; text: string; image: string };

const OVERVIEW = "/assets/screenshots/heatmap-overview.jpg";
const DETAIL = "/assets/screenshots/parks-detail.jpg";
const FILTERS = "/assets/screenshots/filters-panel.jpg";

const HINTS: Hint[] = [
  {
    label: "Did you know",
    text: "The World Health Organization recommends that everyone lives within 300 metres of a green space of at least half a hectare.",
    image: OVERVIEW,
  },
  {
    label: "Tip",
    text: "Click a park to see its size and type. If it does not belong on your map, you can delete it from the popup.",
    image: DETAIL,
  },
  {
    label: "Did you know",
    text: "Shaded surfaces can be 11 to 25 °C cooler than the same surfaces in direct sun.",
    image: OVERVIEW,
  },
  {
    label: "Tip",
    text: "Open the menu at the top left to switch park types on and off, such as parks, nature reserves, woods or allotments.",
    image: FILTERS,
  },
  {
    label: "Did you know",
    text: "A city of a million people or more can be 1 to 3 °C warmer than the countryside around it.",
    image: OVERVIEW,
  },
  {
    label: "Tip",
    text: "Turn on auto-adjust sensitivity in the heatmap settings to keep both green and red areas on screen wherever you look.",
    image: FILTERS,
  },
  {
    label: "Did you know",
    text: "In a 1984 study, hospital patients with a view of trees went home sooner than those who faced a brick wall.",
    image: DETAIL,
  },
  {
    label: "Tip",
    text: "The half-influence distance sets how far a park's green reaches. Bigger and greener parks reach further than small ones.",
    image: FILTERS,
  },
  {
    label: "Did you know",
    text: "Collserola, the forested ridge behind Barcelona, covers about 8,000 hectares and is one of the largest metropolitan parks in the world.",
    image: OVERVIEW,
  },
  {
    label: "Tip",
    text: "Deleted a park by mistake? Restore it from the Deleted Parks tab in the menu.",
    image: FILTERS,
  },
  {
    label: "Did you know",
    text: "OpenStreetMap has more than ten million registered users who map the world together.",
    image: DETAIL,
  },
  {
    label: "Tip",
    text: "Use the download button at the top right to save the heatmap together with the map as a PNG.",
    image: OVERVIEW,
  },
  {
    label: "Tip",
    text: "If loading is slow, pick another Overpass server at the bottom of the Filters tab.",
    image: FILTERS,
  },
];

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < NARROW_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isNarrow;
}

export default function LoadingScreen({ isReady, cityName }: { isReady: boolean; cityName?: string | null }) {
  const isNarrow = useIsNarrow();
  const progress = useSyncExternalStore(subscribeLoadProgress, getLoadProgress);
  const { active, completedSteps, description } = progress;
  const download = describeDownload(progress);

  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * HINTS.length));
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setHintIndex((i) => (i + 1) % HINTS.length), HINT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (active) setHasStarted(true);
  }, [active]);

  // Before the first load starts nothing is counted yet, after it ends only the heatmap is left to draw
  const steps = active ? completedSteps : hasStarted ? TOTAL_STEPS : 0;
  const text = active ? description : hasStarted ? "Drawing the heatmap..." : "Getting your map ready...";
  const hint = HINTS[hintIndex];

  return (
    <div style={{ ...styles.screen, opacity: isReady ? 0 : 1, pointerEvents: isReady ? "none" : "all" }}>
      <div
        style={{
          ...styles.layout,
          flexDirection: isNarrow ? "column" : "row",
          padding: isNarrow ? "2rem 1.25rem" : "2rem clamp(1.5rem, 6vw, 6rem)",
        }}
      >
        <div style={styles.textColumn}>
          <div style={styles.progress}>
            <div style={styles.header}>
              <span style={styles.title}>{cityName ? `Getting ${cityName} ready` : "Getting your map ready"}</span>
              <span style={styles.steps}>{steps}/{TOTAL_STEPS}</span>
            </div>
            <ProgressBar light percent={(steps / TOTAL_STEPS) * 100} height="0.6rem" indeterminate />
            <span style={styles.description}>{text}</span>
            {download && <span style={styles.description}>{download}</span>}
          </div>

          <p key={hintIndex} style={styles.hint}>
            <span style={styles.hintLabel}>{hint.label}</span>
            {hint.text}
          </p>
        </div>

        <img
          key={hint.image}
          src={hint.image}
          alt=""
          style={{ ...styles.screenshot, width: isNarrow ? "100%" : "min(46vw, 52rem)" }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    overflowY: "auto",
    background: "#497a50",
    color: "#ffffff",
    fontFamily: "Inter, sans-serif",
    transition: "opacity 0.5s ease",
  },
  layout: {
    minHeight: "100%",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "clamp(1.5rem, 4vw, 4rem)",
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "2.5rem",
  },
  progress: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    width: "min(32rem, 100%)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "1rem",
  },
  title: {
    fontFamily: '"Bricolage Grotesque", Inter, sans-serif',
    fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
    fontWeight: 700,
    lineHeight: 1.1,
  },
  steps: {
    fontSize: "1rem",
    fontWeight: 500,
  },
  description: {
    fontSize: "0.95rem",
    color: "rgba(255, 255, 255, 0.9)",
  },
  hint: {
    margin: 0,
    maxWidth: "32rem",
    fontSize: "clamp(1.05rem, 1.6vw, 1.3rem)",
    lineHeight: 1.45,
  },
  hintLabel: {
    display: "block",
    marginBottom: "0.35rem",
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "rgba(255, 255, 255, 0.75)",
  },
  screenshot: {
    flexShrink: 0,
    aspectRatio: "16 / 10",
    objectFit: "cover",
    objectPosition: "left top",
    display: "block",
    border: "2px solid #ffffff",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
  },
};