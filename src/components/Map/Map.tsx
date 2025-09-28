import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";
import "leaflet.heat";

export default function Map() {
    const mapRef = useRef<L.Map | null>(null);
    const parksLayerRef = useRef<L.GeoJSON | null>(null);

    useEffect(() => {
        if (mapRef.current) return;

        mapRef.current = L.map("map").setView([41.38, 2.17], 14);
        mapRef.current.setMinZoom(13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
        }).addTo(mapRef.current);

        loadParks();

        mapRef.current.on("moveend", () => {
            loadParks();
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    async function loadParks() {
        if (!mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();

        try {
            await updateParkData([north, east, south, west]);

            // let startTime = performance.now();

            let parks = getBoundedParkData(north, east, south, west);

            const geojson: FeatureCollection<Polygon, { id: number; name: string; area: number }> =
                {
                    type: "FeatureCollection",
                    features: parks.map((park) => {
                        const feature: Feature<
                            Polygon,
                            { id: number; name: string; area: number }
                        > = {
                            type: "Feature",
                            geometry: {
                                type: "Polygon",
                                coordinates: [park.coordinates.map(([lat, lng]) => [lng, lat])],
                            },
                            properties: {
                                id: park.id,
                                name: park.name ?? "",
                                area: park.area ?? -1,
                            },
                        };
                        return feature;
                    }),
                };

            if (parksLayerRef.current) {
                mapRef.current!.removeLayer(parksLayerRef.current);
            }

            // let midTime = performance.now();
            // console.log(`process ${midTime - startTime}`);

            parksLayerRef.current = L.geoJSON(geojson, {
                style: (feature) => ({
                    color: "green",
                    fillColor: getParkColorByArea(feature?.properties?.area),
                    weight: 1,
                    fillOpacity: 0.5,
                }),
                onEachFeature: (feature, layer) => {
                    let name: string =
                        feature.properties?.name.length > 3
                            ? `<strong>Name:</strong> ${feature.properties?.name}<br>`
                            : "";
                    let area: string = `<strong>Area:</strong> ${Math.round(
                        feature.properties?.area
                    )} m²<br>`;
                    let color: string = getParkColorByArea(feature.properties?.area);
                    layer.bindPopup(name + area + color);
                },
            }).addTo(mapRef.current);

            const heatPoints: [number, number, number][] = parks.map((park) => {
                return [park.center[0], park.center[1], Math.sqrt(park.area) / 100];
            });

            if ((mapRef.current as any)._heatLayer) {
                mapRef.current.removeLayer((mapRef.current as any)._heatLayer);
            }

            const heat = (L as any)
                .heatLayer(heatPoints, {
                    radius: 50,
                    blur: 50,
                    maxZoom: 17,
                    gradient: {
                        0.0: "red",
                        0.2: "orange",
                        0.4: "yellow",
                        0.6: "lime",
                        0.8: "green",
                    },
                })
                .addTo(mapRef.current);

            (mapRef.current as any)._heatLayer = heat;

            // let endTime = performance.now();
            // console.log(`draw ${endTime - midTime}`);
        } catch (error) {
            console.error("Error drawing parks:", error);
        }
    }

    return <div id="map" style={{ height: "100vh", width: "100vw", margin: 0, padding: 0 }} />;
}
