import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import OverpassServerPicker from "../../components/OverpassServerPicker/OverpassServerPicker";
import { PRELOADED_CITIES, type PreloadedCity } from "../../utils/preloadedCities";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function toDegreeMinute(value: number, isLat: boolean): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(2);
  const direction = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${degrees}°${minutes}′${direction}`;
}

function LocationPicker({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  const [position, setPosition] = useState<[number, number] | null>(null);

  // Capture map click
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      onPick(lat, lng);
    },
  });

  return position ? <Marker position={position} /> : null;
}

const MAX_SEARCH_RESULTS = 50;
const EXPLORE_ZOOM = 14;
const NARROW_BREAKPOINT = 900;

// Measured on dense European cities: the default server sends the data uncompressed
const LIVE_DOWNLOAD_PER_SQUARE = "3 to 7 MB";
const LIVE_DOWNLOAD_PER_SCREEN = "about 20 MB on a phone and 50 MB or more on a large screen";

const DISPLAY_FONT = '"Bricolage Grotesque", Inter, sans-serif';

const FEATURES = [
  {
    title: "Open any city",
    text: "Search for a city or drop a pin anywhere. The parks around it are downloaded when you open it.",
  },
  {
    title: "Remove what doesn't belong",
    text: "Delete a park that is closed, private or mapped wrongly, and restore it later from the sidebar.",
  },
  {
    title: "Save the map as an image",
    text: "Export the heatmap together with the map underneath it as a PNG.",
  },
  {
    title: "Your data stays in your browser",
    text: "Parks are cached locally, so places you have already visited open without downloading again.",
  },
  {
    title: "Choose your Overpass server",
    text: "If one public server is busy, switch to another or enter your own at the bottom of this page.",
  },
  {
    title: "Click the heatmap",
    text: "Parks open a popup with their size and type, with a button to delete them from your map.",
  },
];

const STEPS = [
  {
    title: "Pick a city",
    text: "Search for one, or choose a spot on the map.",
  },
  {
    title: "Parks are loaded",
    text: "Greenalize reads parks, woods and gardens from OpenStreetMap and keeps them in your browser.",
  },
  {
    title: "Read the heatmap",
    text: "Each point is scored by the green space around it, from red to green.",
  },
];

const CREDITS = [
  {
    title: "Map data",
    text: "© OpenStreetMap contributors, available under the Open Database License.",
    links: [
      {
        label: "OpenStreetMap copyright",
        href: "https://www.openstreetmap.org/copyright",
      },
    ],
  },
  {
    title: "Map tiles",
    text: "The background map uses the standard OpenStreetMap tile layer, displayed with Leaflet.",
    links: [
      {
        label: "Tile usage policy",
        href: "https://operations.osmfoundation.org/policies/tiles/",
      },
      { label: "Leaflet", href: "https://leafletjs.com" },
    ],
  },
  {
    title: "Built with",
    text: "React, Turf.js for geometry and idb-keyval for local storage.",
    links: [
      { label: "React", href: "https://react.dev" },
      { label: "Turf.js", href: "https://turfjs.org" },
    ],
  },
];

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(
    window.innerWidth < NARROW_BREAKPOINT,
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isNarrow;
}

const formatSize = (megabytes: number) => `about ${megabytes.toFixed(1)} MB`;

const CityButton = ({ city, onOpen }: { city: PreloadedCity; onOpen: () => void }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={{ ...styles.cityButton, background: hovered ? "#e4efe5" : "#ffffff" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      <span style={styles.cityButtonName}>{city.name}</span>
      <span style={styles.cityButtonSize}>{formatSize(city.sizeMb)}</span>
    </button>
  );
};

const DataUsageNotice = ({ isLikelyMobile }: { isLikelyMobile: boolean }) => {
  const sizes = PRELOADED_CITIES.map((c) => c.sizeMb);
  const preloadedRange = `${Math.min(...sizes).toFixed(1)} to ${Math.max(...sizes).toFixed(1)} MB`;

  return (
    <div style={isLikelyMobile ? styles.noticeStrong : styles.notice}>
      <b style={isLikelyMobile ? styles.noticeTitle : undefined}>
        {isLikelyMobile ? "You seem to be on a phone or mobile data" : "About data usage"}
      </b>
      <span>
        {isLikelyMobile
          ? `Cities that are not preloaded use ${LIVE_DOWNLOAD_PER_SCREEN} of data. Open one of the preloaded cities above instead, they are only ${preloadedRange}.`
          : `Cities that are not preloaded are downloaded when you open them, which can take a minute. The server sends about ${LIVE_DOWNLOAD_PER_SQUARE} for every 10 km square in a dense city, which adds up to ${LIVE_DOWNLOAD_PER_SCREEN}. The preloaded cities above are ${preloadedRange}.`}
      </span>
    </div>
  );
};

function useIsLikelyMobile(isNarrow: boolean) {
  const connection = (navigator as any).connection;
  const isMetered =
    !!connection && (connection.type === "cellular" || connection.saveData || ["slow-2g", "2g", "3g"].includes(connection.effectiveType));
  return isNarrow || isMetered;
}

const PrimaryButton = ({
  label,
  hint,
  enabled = true,
  light = false,
  onClick,
}: {
  label: string;
  hint?: string;
  enabled?: boolean;
  light?: boolean;
  onClick: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const active = enabled && hovered;

  return (
    <button
      style={{
        ...styles.primaryButton,
        background: !enabled
          ? "#bbbbbbff"
          : light
            ? active
              ? "#e4efe5"
              : "#ffffff"
            : active
              ? "#6f8f71ff"
              : "var(--border-green)",
        color: light ? "#2e4631" : "white",
        boxShadow: !enabled
          ? "none"
          : light
            ? "0 6px 16px rgba(0, 0, 0, 0.2)"
            : `0 6px 16px rgba(121, 163, 124, ${active ? 0.5 : 0.3})`,
        cursor: enabled ? "pointer" : "default",
      }}
      disabled={!enabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <span style={styles.primaryButtonText}>
        <span>{label}</span>
        {hint && <span style={styles.primaryButtonHint}>{hint}</span>}
      </span>
      <img
        src={
          light ? "/assets/icons/arrow-green.svg" : "/assets/icons/arrow.svg"
        }
        alt=""
        style={{
          width: active ? "28px" : "0px",
          height: "28px",
          marginLeft: active ? "10px" : "0",
          opacity: active ? 1 : 0,
          transition: "all 0.4s ease",
        }}
      />
    </button>
  );
};

const Screenshot = ({
  src,
  alt,
  objectPosition = "center",
}: {
  src: string;
  alt: string;
  objectPosition?: string;
}) => (
  <img
    src={src}
    alt={alt}
    loading="lazy"
    style={{ ...styles.screenshot, objectPosition }}
  />
);

export default function LandingPage() {
  const isNarrow = useIsNarrow();
  const isLikelyMobile = useIsLikelyMobile(isNarrow);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<
    {
      city: string;
      subcountry: string;
      country: string;
      population: number;
      lat: number;
      lng: number;
    }[]
  >([]);
  const [filtered, setFiltered] = useState<typeof cities>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // Load CSV once
  useEffect(() => {
    fetch("/assets/data/world-cities.csv")
      .then((r) => r.text())
      .then((text) => {
        const rows = text
          .split("\n")
          .slice(1)
          .map((row) => {
            const [city, subcountry, country, population, lat, lng] = row
              .split(",")
              .map((item) => item.replace(/\\/g, ","));
            return {
              city,
              subcountry,
              country,
              population: parseFloat(population) || 0,
              lat: parseFloat(lat) || 0,
              lng: parseFloat(lng) || 0,
            };
          })
          .filter((r) => r.city);
        setCities(rows);
      })
      .catch((err) => console.error("Error loading cities:", err));
  }, []);

  function filter(custom_query?: string | undefined) {
    if (!custom_query) custom_query = query;
    if (!custom_query) {
      setFiltered([]);
      setShowDropdown(false);
      return;
    }
    const q = custom_query.toLowerCase().replace(/ /g, "").replace(/,/g, "");

    const matches = cities
      .filter((c) =>
        (c.city.toLowerCase() + c.country.toLowerCase())
          .replace(/ /g, "")
          .includes(q),
      )
      .slice(0, MAX_SEARCH_RESULTS);
    setFiltered(matches);
    setShowDropdown(matches.length > 0);
  }

  useEffect(filter, [query, cities]);

  // Hide dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function explore(lat: number, lng: number, zoom = EXPLORE_ZOOM, name?: string) {
    navigate(`/map?lat=${lat}&lng=${lng}&zoom=${zoom}${name ? `&name=${encodeURIComponent(name)}` : ""}`);
  }

  const sectionPadding = isNarrow
    ? "3rem 1.25rem"
    : "5rem clamp(1.5rem, 6vw, 6rem)";
  const split: React.CSSProperties = {
    ...styles.split,
    gridTemplateColumns: isNarrow
      ? "minmax(0, 1fr)"
      : "minmax(0, 1fr) minmax(0, 1.25fr)",
  };

  return (
    <div style={styles.page}>
      {/* ── Hero ── */}
      <header
        style={{
          ...styles.hero,
          flexDirection: isNarrow ? "column" : "row",
          padding: isNarrow
            ? "1.5rem 1.25rem 2.5rem"
            : "2rem 0 2rem clamp(1.5rem, 6vw, 6rem)",
        }}
      >
        <div
          style={{
            ...styles.heroText,
            paddingRight: isNarrow ? 0 : "clamp(1.5rem, 4vw, 4rem)",
          }}
        >
          <span style={styles.brand}>Greenalize</span>
          <h1 style={styles.title}>
            Visualize park density with open source data
          </h1>
          <p style={styles.heroLead}>
            Greenalize turns the parks, woods and gardens in OpenStreetMap into
            a heatmap of how much green space is really nearby.
          </p>

          <div style={styles.cityList}>
            <span style={styles.cityListLabel}>Preloaded cities open right away</span>
            <div style={styles.cityButtons}>
              {PRELOADED_CITIES.map((city) => (
                <CityButton key={city.id} city={city} onOpen={() => navigate(`/preloaded/${city.id}`)} />
              ))}
            </div>
          </div>

          <div style={styles.searchContainer} ref={searchContainerRef}>
            <input
              type="text"
              placeholder="Or search for another city..."
              aria-label="Search for a city"
              style={
                showDropdown ? styles.searchBarWithDropdown : styles.searchBar
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                filter(e.target.value);
              }}
              onFocus={() => filtered.length > 0 && setShowDropdown(true)}
            />
            {showDropdown && (
              <ul style={styles.dropdown}>
                {filtered.map((c, index) => (
                  <li
                    key={index}
                    style={styles.dropdownItem}
                    tabIndex={0}
                    onClick={() => explore(c.lat, c.lng, EXPLORE_ZOOM, c.city)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); // avoid page scroll on Space
                        explore(c.lat, c.lng, EXPLORE_ZOOM, c.city);
                      }
                    }}
                  >
                    <b>{c.city}</b>
                    <br />
                    <span style={{ color: "#555" }}>
                      {c.country}
                      {c.subcountry.length > 0 ? "," : ""} <i>{c.subcountry}</i>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DataUsageNotice isLikelyMobile={isLikelyMobile} />
        </div>

        <div
          style={{ ...styles.heroVisual, width: isNarrow ? "100%" : "52vw" }}
        >
          <img
            src="/assets/screenshots/heatmap-overview.jpg"
            alt="A heatmap of green space over a street map of Barcelona"
            style={{
              ...styles.heroImage,
              borderRadius: isNarrow ? 12 : "12px 0 0 12px",
            }}
          />
          {!isNarrow && (
            <>
              <div style={styles.heroInset}>
                <img
                  src="/assets/screenshots/filters-panel.jpg"
                  alt="The customize panel with park type filters and heatmap settings"
                  style={{
                    ...styles.screenshotFill,
                    objectPosition: "left top",
                  }}
                />
              </div>
              <div style={styles.legend}>
                <div style={styles.legendBar} />
                <div style={styles.legendLabels}>
                  <span>Little green nearby</span>
                  <span>Green all around</span>
                </div>
              </div>
            </>
          )}
        </div>
      </header>
      {/* ── Features ── */}
      <section style={{ ...styles.section, padding: sectionPadding }}>
        <h2 style={styles.heading}>What you can do</h2>

        <div style={split}>
          <div style={styles.splitText}>
            <h3 style={styles.subheading}>Zoom in to the street</h3>
            <p style={styles.bodyText}>
              Parks, gardens, woods and playgrounds are drawn as outlines on top
              of the map. When one park sits inside another they are merged, so
              a pond or playground does not count twice.
            </p>
          </div>
          <Screenshot
            src="/assets/screenshots/parks-detail.jpg"
            alt="Park outlines over a street map of central Barcelona"
          />
        </div>

        <div style={split}>
          {!isNarrow && (
            <Screenshot
              src="/assets/screenshots/filters-panel.jpg"
              alt="Filters grouped by park type, with sliders for the heatmap"
              objectPosition="left top"
            />
          )}
          <div style={styles.splitText}>
            <h3 style={styles.subheading}>Decide what counts as green</h3>
            <p style={styles.bodyText}>
              Switch whole groups on or off, such as parks, nature reserves,
              woods or allotments, or open a group to pick single types. Set how
              far a park's influence reaches and how much its size matters.
              Auto-adjust sensitivity keeps both green and red areas on screen
              wherever you look.
            </p>
          </div>
          {isNarrow && (
            <Screenshot
              src="/assets/screenshots/filters-panel.jpg"
              alt="Filters grouped by park type, with sliders for the heatmap"
              objectPosition="left top"
            />
          )}
        </div>

        <div style={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <div key={feature.title} style={styles.feature}>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureText}>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <div style={styles.tintedBand}>
        <section style={{ ...styles.section, padding: sectionPadding }}>
          <h2 style={styles.heading}>How it works</h2>
          <div style={styles.steps}>
            {STEPS.map((step, index) => (
              <div key={step.title} style={styles.step}>
                <span style={styles.stepNumber}>{index + 1}</span>
                <h3 style={styles.featureTitle}>{step.title}</h3>
                <p style={styles.featureText}>{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Map picker ── */}
      <section style={{ ...styles.section, padding: sectionPadding }}>
        <div style={split}>
          <div style={styles.splitText}>
            <h2 style={styles.heading}>Or pick a spot on the map</h2>
            <p style={styles.bodyText}>
              Click anywhere in the world and open the heatmap centered on it.
              Zoom in first if you want to be exact.
            </p>
            <div style={styles.coords}>
              {coords
                ? `${toDegreeMinute(coords.lat, true)} ${toDegreeMinute(coords.lng, false)}`
                : "No spot chosen yet"}
            </div>
            <PrimaryButton
              label={coords ? "Open this spot" : "Choose a spot first"}
              enabled={!!coords}
              onClick={() => coords && explore(coords.lat, coords.lng)}
            />
          </div>
          <div style={styles.map}>
            <MapContainer
              center={[20, 0]}
              zoom={2}
              style={{ height: "100%", width: "100%", borderRadius: "10px" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              />
              <LocationPicker onPick={(lat, lng) => setCoords({ lat, lng })} />
            </MapContainer>
          </div>
        </div>
      </section>

      {/* ── Sources & credits ── */}
      <footer style={{ ...styles.footer, padding: sectionPadding }}>
        <h2 style={{ ...styles.heading, color: "#ffffff" }}>
          Sources and credits
        </h2>
        <div style={styles.creditGrid}>
          {CREDITS.map((credit) => (
            <div key={credit.title} style={styles.credit}>
              <h3 style={styles.creditTitle}>{credit.title}</h3>
              <p style={styles.creditText}>{credit.text}</p>
              <div style={styles.creditLinks}>
                {credit.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}

          <div style={styles.credit}>
            <h3 style={styles.creditTitle}>Park data server</h3>
            <p style={styles.creditText}>
              Parks are downloaded through the Overpass API. Public servers can
              get busy, so you can pick another one.
            </p>
            <div
              style={{ "--text-disabled": "#a9c4ac" } as React.CSSProperties}
            >
              <OverpassServerPicker />
            </div>
            <div style={styles.creditLinks}>
              <a
                href="https://wiki.openstreetmap.org/wiki/Overpass_API"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.link}
              >
                About Overpass API
              </a>
            </div>
          </div>
        </div>
        <p style={styles.disclaimer}>
          Greenalize is an independent project and is not affiliated with
          OpenStreetMap.
        </p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    overflowX: "hidden",
    backgroundColor: "#fff",
    fontFamily: "Inter, sans-serif",
    color: "#2e4631",
  },

  // ── Hero ──
  hero: {
    position: "relative",
    minHeight: "100vh",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: "2rem",
    background: "#497a50",
    color: "#ffffff",
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1.25rem",
  },
  brand: {
    fontFamily: DISPLAY_FONT,
    fontSize: "1.2rem",
    fontWeight: 700,
  },
  title: {
    margin: 0,
    fontFamily: DISPLAY_FONT,
    fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)",
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  heroLead: {
    margin: 0,
    fontSize: "1.1rem",
    lineHeight: 1.55,
    maxWidth: "32rem",
    color: "rgba(255, 255, 255, 0.9)",
  },
  cityList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    width: "100%",
  },
  cityListLabel: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "rgba(255, 255, 255, 0.9)",
  },
  cityButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6rem",
  },
  cityButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.1rem",
    padding: "0.6rem 1rem",
    border: "none",
    borderRadius: 12,
    fontFamily: "inherit",
    color: "#2e4631",
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.2)",
    transition: "background 0.25s ease",
  },
  cityButtonName: {
    fontSize: "1rem",
    fontWeight: 600,
  },
  cityButtonSize: {
    fontSize: "0.75rem",
    color: "#4b6f54",
  },
  notice: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    boxSizing: "border-box",
    width: "100%",
    padding: "0.75rem 1rem",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    borderRadius: 10,
    fontSize: "0.85rem",
    lineHeight: 1.5,
    color: "rgba(255, 255, 255, 0.9)",
  },
  noticeStrong: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    boxSizing: "border-box",
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#ffffff",
    border: "2px solid #b3261e",
    borderRadius: 10,
    fontSize: "0.9rem",
    lineHeight: 1.5,
    color: "#2e4631",
  },
  noticeTitle: {
    color: "#b3261e",
  },
  heroVisual: {
    position: "relative",
    flexShrink: 0,
  },
  heroImage: {
    width: "100%",
    aspectRatio: "4 / 3",
    maxHeight: "80vh",
    maxWidth: "50vw",
    objectFit: "cover",
    display: "block",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
  },
  heroInset: {
    position: "absolute",
    left: "-3rem",
    bottom: "-1.5rem",
    width: "min(18vw, 18rem)",
    aspectRatio: "1 / 1",
    overflow: "hidden",
    background: "var(--background)",
    border: "2px solid #ffffff",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
  },
  legend: {
    position: "absolute",
    right: "1.5rem",
    bottom: "1.5rem",
    width: "min(16rem, 40%)",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "0.6rem 0.9rem",
    background: "var(--background)",
    border: "2px solid var(--border-green)",
    borderRadius: 10,
    color: "#2e4631",
  },
  legendBar: {
    height: "0.6rem",
    borderRadius: "999px",
    background:
      "linear-gradient(to right, hsl(0, 85%, 62%), hsl(55, 95%, 55%), hsl(119, 85%, 50%))",
  },
  legendLabels: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  // ── Search ──
  searchContainer: {
    position: "relative",
    width: "100%",
  },
  searchBar: {
    width: "100%",
    padding: "12px 18px",
    fontSize: "1rem",
    borderRadius: 12,
    border: "2px solid #ffffff",
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.15)",
    transition: "all 0.4s ease",
  },
  searchBarWithDropdown: {
    width: "100%",
    padding: "12px 18px",
    fontSize: "1rem",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    border: "2px solid var(--border-green)",
    borderBottomStyle: "dashed",
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "0 8px 30px rgba(121, 163, 124, 0.15)",
    transition: "all 0.4s ease",
  },
  dropdown: {
    position: "absolute",
    top: "100%", // directly below input
    left: 0,
    right: 0,
    backgroundColor: "white",
    border: "2px solid var(--border-green)",
    borderTop: "none",
    borderRadius: "0 0 12px 12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    margin: 0,
    padding: 0,
    listStyle: "none",
    zIndex: 10000,
    maxHeight: 250,
    overflowY: "auto",
  },
  dropdownItem: {
    color: "#2e4631",
    padding: "10px 16px",
    cursor: "pointer",
    transition: "background 0.2s ease",
  },

  // ── Sections ──
  section: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "3.5rem",
    maxWidth: "90rem",
    margin: "0 auto",
  },
  tintedBand: {
    background: "#f2fbf3",
  },
  heading: {
    margin: 0,
    fontFamily: DISPLAY_FONT,
    fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
  },
  subheading: {
    margin: 0,
    fontFamily: DISPLAY_FONT,
    fontSize: "1.7rem",
    fontWeight: 700,
    lineHeight: 1.15,
  },
  bodyText: {
    margin: 0,
    fontSize: "1.05rem",
    lineHeight: 1.6,
    maxWidth: "34rem",
    color: "var(--text-normal)",
  },
  split: {
    display: "grid",
    gap: "clamp(1.5rem, 4vw, 4rem)",
    alignItems: "center",
  },
  splitText: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1rem",
  },
  screenshot: {
    width: "100%",
    aspectRatio: "16 / 10",
    objectFit: "cover",
    display: "block",
    border: "2px solid var(--border-green)",
    borderRadius: 12,
    boxShadow: "0 8px 30px rgba(121, 163, 124, 0.25)",
  },
  screenshotFill: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  // ── Features ──
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
    columnGap: "2.5rem",
    rowGap: "2rem",
  },
  feature: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    paddingTop: "1rem",
    borderTop: "2px solid var(--border-green)",
  },
  featureTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--text-heading)",
  },
  featureText: {
    margin: 0,
    fontSize: "0.95rem",
    lineHeight: 1.55,
    color: "var(--text-normal)",
  },

  // ── How it works ──
  steps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
    gap: "2.5rem",
  },
  step: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  stepNumber: {
    fontFamily: DISPLAY_FONT,
    fontSize: "3rem",
    fontWeight: 700,
    lineHeight: 1,
    color: "var(--border-green)",
  },

  // ── Map picker ──
  map: {
    width: "100%",
    border: "2px solid var(--border-green)",
    backgroundColor: "#f2fbf3",
    height: "clamp(18rem, 45vh, 28rem)",
    boxSizing: "border-box",
    boxShadow: "0 8px 30px rgba(121, 163, 124, 0.25)",
    borderRadius: "12px",
  },
  coords: {
    fontFamily: "monospace",
    color: "var(--text-normal)",
  },
  primaryButton: {
    backgroundColor: "var(--border-green)", // soft green
    color: "white",
    border: "none",
    borderRadius: "12px",
    padding: "1rem 1.75rem",
    fontFamily: "inherit",
    fontSize: "1.1rem",
    fontWeight: 600,
    boxShadow: "0 6px 16px rgba(121, 163, 124, 0.3)",
    transition: "all 0.25s ease-in-out",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    textAlign: "left",
  },
  primaryButtonText: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  primaryButtonHint: {
    fontSize: "0.8rem",
    fontWeight: 500,
    opacity: 0.9,
  },

  // ── Sources & credits ──
  footer: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "2.5rem",
    background: "#2e4631",
    color: "#e4efe5",
  },
  creditGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
    gap: "2.5rem",
    maxWidth: "90rem",
  },
  credit: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    alignItems: "flex-start",
  },
  creditTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#ffffff",
  },
  creditText: {
    margin: 0,
    fontSize: "0.95rem",
    lineHeight: 1.55,
  },
  creditLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem 1rem",
  },
  link: {
    color: "#bfe0c2",
    fontSize: "0.9rem",
    textDecoration: "underline",
  },
  disclaimer: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#a9c4ac",
  },
};
