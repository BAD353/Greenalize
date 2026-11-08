import React, { useState } from "react";
import {
  AUTO_SERVER_ID,
  OVERPASS_SERVERS,
  getSavedOverpassServerUrl,
  isValidOverpassUrl,
  setOverpassServerUrl,
} from "../../backend/mapData/overpassServer";

const CUSTOM_ID = "custom";
const AUTO_NOTE = "Dresel Systems in Europe and overpass-api.de elsewhere, switching to another server if one is busy.";

function findPreset(url: string) {
  return OVERPASS_SERVERS.find((s) => s.url === url);
}

export default function OverpassServerPicker() {
  const savedUrl = getSavedOverpassServerUrl();
  const [selectedId, setSelectedId] = useState(savedUrl ? findPreset(savedUrl)?.id ?? CUSTOM_ID : AUTO_SERVER_ID);
  const [customUrl, setCustomUrl] = useState(savedUrl && !findPreset(savedUrl) ? savedUrl : "");

  const selectedPreset = OVERPASS_SERVERS.find((s) => s.id === selectedId);
  const customInvalid = selectedId === CUSTOM_ID && customUrl.length > 0 && !isValidOverpassUrl(customUrl);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const preset = OVERPASS_SERVERS.find((s) => s.id === id);
    if (id === AUTO_SERVER_ID) setOverpassServerUrl(null);
    else if (preset) setOverpassServerUrl(preset.url);
    else if (isValidOverpassUrl(customUrl)) setOverpassServerUrl(customUrl);
  };

  const handleCustomChange = (value: string) => {
    setCustomUrl(value);
    if (isValidOverpassUrl(value)) setOverpassServerUrl(value);
  };

  return (
    <div style={styles.container}>
      <select
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        style={styles.select}
        aria-label="Overpass server"
      >
        <option value={AUTO_SERVER_ID}>Automatic</option>
        {OVERPASS_SERVERS.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        <option value={CUSTOM_ID}>Custom server</option>
      </select>

      {selectedId === AUTO_SERVER_ID ? (
        <span style={styles.hint}>{AUTO_NOTE}</span>
      ) : selectedPreset ? (
        <span style={styles.hint}>{selectedPreset.note}</span>
      ) : (
        <>
          <input
            type="url"
            value={customUrl}
            placeholder="https://example.org/api/interpreter"
            onChange={(e) => handleCustomChange(e.target.value)}
            style={{ ...styles.input, borderColor: customInvalid ? "var(--red)" : "var(--border-green)" }}
            aria-label="Custom Overpass server URL"
          />
          <span style={{ ...styles.hint, color: customInvalid ? "var(--red)" : styles.hint.color }}>
            {customInvalid ? "Enter the full endpoint, ending in /interpreter" : "The full endpoint of an Overpass API server"}
          </span>
        </>
      )}
      <span style={styles.hint}>Used for the next area you load. Parks already loaded stay as they are.</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    width: "100%",
  },
  select: {
    padding: "0.5rem 0.6rem",
    fontSize: "0.9rem",
    fontFamily: "inherit",
    color: "var(--text-normal)",
    background: "var(--background)",
    border: "2px solid var(--border-green)",
    borderRadius: 8,
    outline: "none",
    cursor: "pointer",
  },
  input: {
    padding: "0.5rem 0.6rem",
    fontSize: "0.9rem",
    fontFamily: "inherit",
    color: "var(--text-normal)",
    border: "2px solid var(--border-green)",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
  },
  hint: {
    fontSize: "0.75rem",
    color: "var(--text-disabled)",
  },
};