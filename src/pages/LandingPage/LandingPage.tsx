import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useNavigate } from "react-router-dom";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapController({
    coords,
    zoom,
}: {
    coords: { lat: number; lng: number } | null;
    zoom: number | undefined;
}) {
    const map = useMap();
    useEffect(() => {
        if (coords) {
            map.setView([coords.lat, coords.lng], zoom ?? map.getZoom(), { animate: true });
        }
    }, [coords, map]);
    return null;
}

function toDegreeMinute(value: number, isLat: boolean): string {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = ((absolute - degrees) * 60).toFixed(2);
    const direction = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
    return `${degrees}°${minutes}′${direction}`;
}

function LocationPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
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

export default function LandingPage() {
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
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [zoom, setZoom] = useState<number | undefined>(undefined);

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
                (c.city.toLowerCase() + c.country.toLowerCase()).replace(/ /g, "").includes(q)
            )
            .slice(0, 1000);
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

    const [hovered, setHovered] = useState(false);
    const navigate = useNavigate();

    return (
        <div style={styles.page}>
            <div style={styles.container}>
                <h1 style={styles.title}>Discover Your City</h1>

                <div style={styles.searchContainer} ref={searchContainerRef}>
                    <input
                        type="text"
                        placeholder="Enter your city..."
                        style={showDropdown ? styles.searchBarWithDropdown : styles.searchBar}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            filter(e.target.value);
                        }}
                        onFocus={() => filtered.length > 0 && setShowDropdown(true)}
                        onMouseOver={(e) => {
                            e.currentTarget.style.boxShadow =
                                "0 8px 30px rgba(121, 163, 124, 0.35)";
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.boxShadow =
                                "0 8px 30px rgba(121, 163, 124, 0.15)";
                        }}
                    />
                    {showDropdown && (
                        <ul style={styles.dropdown}>
                            {filtered.map((c, index) => (
                                <li
                                    key={index}
                                    style={styles.dropdownItem}
                                    onClick={() => {
                                        setQuery(c.city + ", " + c.country);
                                        setShowDropdown(false);
                                        setCoords({ lat: c.lat, lng: c.lng });
                                        setZoom(10);
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
                <p style={styles.subtitle}>OR</p>

                <div style={styles.mapContainer}>
                    <div
                        style={styles.map}
                        onMouseOver={(e) => {
                            e.currentTarget.style.boxShadow =
                                "0 8px 30px rgba(121, 163, 124, 0.35)";
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.boxShadow = "0 8px 30px rgba(121, 163, 124, 0.1)";
                        }}
                    >
                        <MapContainer
                            center={[20, 0]}
                            zoom={2}
                            style={{ height: "100%", width: "100%", borderRadius: "12px" }}
                        >
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                            />
                            <MapController coords={coords} zoom={zoom} />
                            <LocationPicker
                                onPick={(lat, lng) => {
                                    setCoords({ lat, lng });
                                    setZoom(undefined);
                                }}
                            />
                        </MapContainer>
                    </div>

                    {coords && (
                        <div
                            style={{
                                marginTop: "10px",
                                fontFamily: "monospace",
                                textAlign: "center",
                            }}
                        >
                            {toDegreeMinute(coords.lat, true)}
                            <br /> {toDegreeMinute(coords.lng, false)}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        ...styles.nextButton,
                        background: coords ? (hovered ? "#6f8f71ff" : "#79a37cff") : "#bbbbbbff",
                        boxShadow: coords
                            ? `0 6px 16px rgba(121, 163, 124, ${hovered ? 0.5 : 0.3})`
                            : "",
                        cursor: coords ? "pointer" : "default",
                    }}
                    onMouseEnter={() => setHovered(coords ? true : false)}
                    onMouseLeave={() => setHovered(false)}
                    onClick={() => {
                        if(coords)navigate(`/map?lat=${coords?.lat}&lng=${coords?.lng}&zoom=15`);
                    }}
                >
                    <span
                        style={{
                            marginRight: hovered ? "10px" : "0",
                            transition: "margin 0.3s ease",
                        }}
                    >
                        GO
                    </span>
                    <img
                        src={"/assets/icons/arrow.svg"}
                        style={{
                            width: hovered ? "36px" : "0px",
                            height: "36px",
                            overflow: "hidden",
                            opacity: hovered ? 1 : 0,
                            transition: "all 0.4s ease",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        height: "100vh",
        width: "100vw",
        backgroundColor: "var(--background)",
        display: "flex",
        justifyContent: "center",
        fontFamily: "Roboto, sans-serif",
        color: "#2e4631",
    },
    container: {
        borderRadius: 20,
        padding: "40px 30px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
    },
    title: {
        fontSize: "3rem",
        margin: 0,
        fontWeight: 600,
        paddingTop: "2rem",
        paddingBottom: "4rem",
    },
    subtitle: {
        margin: 0,
        color: "#4b6f54",
        padding: "1rem 0rem",
    },
    searchContainer: {
        position: "relative",
        width: "100%",
    },
    searchBar: {
        width: "70vw",
        padding: "12px 18px",
        fontSize: "1rem",
        borderRadius: 12,
        border: "2px solid #79a37cff",
        outline: "none",
        boxSizing: "border-box",
        boxShadow: "0 8px 30px rgba(121, 163, 124, 0.15)",
        transition: "all 0.4s ease",
    },
    searchBarWithDropdown: {
        width: "70vw",
        padding: "12px 18px",
        fontSize: "1rem",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        border: "2px solid #79a37cff",
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
        border: "2px solid #79a37cff",
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
        padding: "10px 16px",
        cursor: "pointer",
        transition: "background 0.2s ease",
    },
    map: {
        width: "30vw",
        border: "2px solid #79a37cff",
        backgroundColor: "#f2fbf3",
        height: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 30px rgba(121, 163, 124, 0.1)",
        borderRadius: "12px",
        transition: "all 0.4s ease",
    },
    mapContainer: {
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        borderRadius: "12px",
    },
    mapPlaceholder: {
        color: "#709e74",
        fontSize: "1.2rem",
        letterSpacing: "0.5px",
        borderRadius: "12px",
    },
    nextButton: {
        backgroundColor: "#79a37cff", // soft green
        color: "white",
        border: "none",
        borderRadius: "12px",
        padding: "1.2rem 2.5rem",
        marginTop: "2rem",
        fontSize: "1.1rem",
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 6px 16px rgba(121, 163, 124, 0.3)",
        transition: "all 0.25s ease-in-out",
        display: "flex",
        flexDirection: "row",
        justifyItems: "center",
        alignItems: "center",
    },
};
