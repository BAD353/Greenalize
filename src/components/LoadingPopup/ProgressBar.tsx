import React from "react";

const BLOB_KEYFRAMES = `
@keyframes loading-blob {
  from { transform: translateX(-100%); }
  to { transform: translateX(350%); }
}
@media (prefers-reduced-motion: reduce) {
  .loading-blob { animation: none !important; transform: translateX(100%); }
}
`;

export default function ProgressBar({
  percent,
  height,
  light = false,
  indeterminate = false,
}: {
  percent: number;
  height: string;
  light?: boolean;
  // A blob keeps sweeping across the part of the bar that is still empty so it never looks frozen
  indeterminate?: boolean;
}) {
  return (
    <div style={{ ...styles.track, height, background: light ? "rgba(255, 255, 255, 0.25)" : "var(--green-background)" }}>
      <style>{BLOB_KEYFRAMES}</style>
      <div style={{ ...styles.fill, width: `${percent}%`, background: light ? "#ffffff" : "var(--green)" }} />
      {indeterminate && percent < 100 && (
        <div style={{ ...styles.remaining, left: `${percent}%` }}>
          <div
            className="loading-blob"
            style={{
              ...styles.blob,
              background: `linear-gradient(90deg, transparent, ${light ? "rgba(255, 255, 255, 0.9)" : "var(--green)"}, transparent)`,
            }}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  track: {
    position: "relative",
    width: "100%",
    borderRadius: "999px",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: "999px",
    transition: "width 0.3s ease",
  },
  // The empty part of the bar, it follows the fill so the blob never runs over finished progress
  remaining: {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    overflow: "hidden",
    transition: "left 0.3s ease",
  },
  blob: {
    width: "30%",
    height: "100%",
    animation: "loading-blob 1.4s linear infinite",
  },
};