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

const Blob = ({ color }: { color: string }) => (
  <div
    className="loading-blob"
    style={{ ...styles.blob, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
  />
);

export default function ProgressBar({
  percent,
  height,
  light = false,
  indeterminate = false,
}: {
  percent: number;
  height: string;
  light?: boolean;
  // A blob keeps sweeping across the whole bar so it never looks frozen while the real progress is not moving
  indeterminate?: boolean;
}) {
  // The blob must stay visible on the empty track and on the filled part, so each gets its own contrasting colour
  const trackBlobColor = light ? "rgba(255, 255, 255, 0.9)" : "var(--green)";
  const fillBlobColor = light ? "rgba(73, 122, 80, 0.55)" : "rgba(255, 255, 255, 0.7)";

  return (
    <div style={{ ...styles.track, height, background: light ? "rgba(255, 255, 255, 0.25)" : "var(--green-background)" }}>
      <style>{BLOB_KEYFRAMES}</style>
      {indeterminate && <Blob color={trackBlobColor} />}
      <div style={{ ...styles.fill, width: `${percent}%`, background: light ? "#ffffff" : "var(--green)" }}>
        {indeterminate && percent > 0 && (
          <div style={{ ...styles.fillInner, width: `${10000 / percent}%` }}>
            <Blob color={fillBlobColor} />
          </div>
        )}
      </div>
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
    position: "relative",
    height: "100%",
    borderRadius: "999px",
    overflow: "hidden",
    transition: "width 0.3s ease",
  },
  // As wide as the whole track, so the blob inside the fill lines up with the one on the track
  fillInner: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "30%",
    height: "100%",
    animation: "loading-blob 1.4s linear infinite",
  },
};