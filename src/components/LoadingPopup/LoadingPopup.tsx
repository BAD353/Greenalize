import React, { useSyncExternalStore } from "react";
import { describeDownload, getLoadProgress, subscribeLoadProgress, TOTAL_STEPS } from "../../backend/mapData/loadProgress";
import ProgressBar from "./ProgressBar";

export default function LoadingPopup() {
  const progress = useSyncExternalStore(subscribeLoadProgress, getLoadProgress);
  const { active, completedSteps, description, subProgress } = progress;
  const download = describeDownload(progress);

  if (!active) return null;

  return (
    <div style={styles.popup}>
      <div style={styles.header}>
        <span style={styles.title}>Loading parks</span>
        <span style={styles.steps}>Step {Math.min(completedSteps + 1, TOTAL_STEPS)}/{TOTAL_STEPS}</span>
      </div>
      <ProgressBar
        percent={(completedSteps / TOTAL_STEPS) * 100}
        height="0.5rem"
        indeterminate={completedSteps < TOTAL_STEPS}
      />
      <span style={styles.description}>{description}</span>
      {download && <span style={styles.description}>{download}</span>}
      {subProgress !== null && <ProgressBar percent={subProgress} height="0.35rem" />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  popup: {
    position: "absolute",
    bottom: "1.5rem",
    right: "1.5rem",
    width: "18rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    padding: "0.75rem 1rem",
    background: "var(--background)",
    borderRadius: "10px",
    border: "2px solid var(--button-border-green)",
    zIndex: "100",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: "var(--text-heading)",
    fontSize: "1rem",
    fontWeight: 600,
  },
  steps: {
    color: "var(--text-normal)",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  description: {
    color: "var(--text-normal)",
    fontSize: "0.85rem",
  },
};