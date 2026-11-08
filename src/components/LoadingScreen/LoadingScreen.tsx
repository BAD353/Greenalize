import React, { useEffect, useState, useSyncExternalStore } from "react";
import { describeDownload, getLoadProgress, subscribeLoadProgress, TOTAL_STEPS } from "../../backend/mapData/loadProgress";
import ProgressBar from "../LoadingPopup/ProgressBar";
import { PRELOADED_CITIES } from "../../utils/preloadedCities";

const HINT_INTERVAL_MS = 7000;
const CITY_INTERVAL_MS = 6000;

const PHOTO_FADE_MS = 1200;

const FADE_KEYFRAMES = `
@keyframes loading-caption-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .loading-photo { transition: none !important; }
  .loading-caption { animation: none !important; }
}
`;
const NARROW_BREAKPOINT = 900;

type Hint = { label: "Did you know" | "Tip"; text: string };

const HINTS: Hint[] = [
  {
    label: "Did you know",
    text: "The World Health Organization recommends that everyone lives within 300 metres of a green space of at least half a hectare.",
  },
  {
    label: "Tip",
    text: "Click a park to see its size and type. If it does not belong on your map, you can delete it from the popup.",
  },
  {
    label: "Did you know",
    text: "Shaded surfaces can be 11 to 25 °C cooler than the same surfaces in direct sun.",
  },
  {
    label: "Tip",
    text: "Open the menu at the top left to switch park types on and off, such as parks, nature reserves, woods or allotments.",
  },
  {
    label: "Did you know",
    text: "A city of a million people or more can be 1 to 3 °C warmer than the countryside around it.",
  },
  {
    label: "Tip",
    text: "Turn on auto-adjust sensitivity in the heatmap settings to keep both green and red areas on screen wherever you look.",
  },
  {
    label: "Did you know",
    text: "In a 1984 study, hospital patients with a view of trees went home sooner than those who faced a brick wall.",
  },
  {
    label: "Tip",
    text: "The half-influence distance sets how far a park's green reaches. Bigger and greener parks reach further than small ones.",
  },
  {
    label: "Did you know",
    text: "Collserola, the forested ridge behind Barcelona, covers about 8,000 hectares and is one of the largest metropolitan parks in the world.",
  },
  {
    label: "Tip",
    text: "Deleted a park by mistake? Restore it from the Deleted Parks tab in the menu.",
  },
  {
    label: "Did you know",
    text: "OpenStreetMap has more than ten million registered users who map the world together.",
  },
  {
    label: "Tip",
    text: "Use the download button at the top right to save the heatmap together with the map as a PNG.",
  },
  {
    label: "Tip",
    text: "If loading is slow, pick another Overpass server at the bottom of the Filters tab.",
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
  // Start on the city that is being opened when it has a screenshot, otherwise on a random one
  const [cityIndex, setCityIndex] = useState(() => {
    const match = PRELOADED_CITIES.findIndex((c) => c.name === cityName);
    return match >= 0 ? match : Math.floor(Math.random() * PRELOADED_CITIES.length);
  });
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setHintIndex((i) => (i + 1) % HINTS.length), HINT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCityIndex((i) => (i + 1) % PRELOADED_CITIES.length), CITY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (active) setHasStarted(true);
  }, [active]);

  // Before the first load starts nothing is counted yet, after it ends only the heatmap is left to draw
  const steps = active ? completedSteps : hasStarted ? TOTAL_STEPS : 0;
  const text = active ? description : hasStarted ? "Drawing the heatmap..." : "Getting your map ready...";
  const hint = HINTS[hintIndex];
  const photoCity = PRELOADED_CITIES[cityIndex];

  // Photos are stacked and crossfade, so the next one is loaded before it is needed and never pops in half drawn
  const [shownPhotos, setShownPhotos] = useState<Set<number>>(() => new Set([cityIndex]));
  useEffect(() => {
    setShownPhotos((shown) => new Set([...shown, cityIndex, (cityIndex + 1) % PRELOADED_CITIES.length]));
  }, [cityIndex]);

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
              <span style={styles.steps}>Step {Math.min(steps + 1, TOTAL_STEPS)}/{TOTAL_STEPS}</span>
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

        <figure style={{ ...styles.figure, width: isNarrow ? "100%" : "min(46vw, 52rem)" }}>
          <style>{FADE_KEYFRAMES}</style>
          <div style={styles.photoFrame}>
            {PRELOADED_CITIES.map((city, index) =>
              shownPhotos.has(index) ? (
                <img
                  key={city.id}
                  className="loading-photo"
                  src={city.screenshot}
                  alt={index === cityIndex ? `A green space heatmap of ${city.name}` : ""}
                  aria-hidden={index !== cityIndex}
                  style={{ ...styles.screenshot, opacity: index === cityIndex ? 1 : 0 }}
                />
              ) : null
            )}
          </div>
          <figcaption key={photoCity.id} className="loading-caption" style={styles.caption}>
            <span style={styles.captionName}>{photoCity.name}</span>
            <span style={styles.captionCountry}>{photoCity.country}</span>
          </figcaption>
        </figure>
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
  figure: {
    flexShrink: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  photoFrame: {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 10",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
    background: "rgba(255, 255, 255, 0.15)",
  },
  screenshot: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    boxSizing: "border-box",
    border: "2px solid #ffffff",
    borderRadius: 12,
    transition: `opacity ${PHOTO_FADE_MS}ms ease-in-out`,
  },
  caption: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.6rem",
    animation: `loading-caption-fade ${PHOTO_FADE_MS}ms ease-in-out`,
  },
  captionName: {
    fontFamily: '"Bricolage Grotesque", Inter, sans-serif',
    fontSize: "1.3rem",
    fontWeight: 700,
  },
  captionCountry: {
    fontSize: "0.95rem",
    color: "rgba(255, 255, 255, 0.8)",
  },
};